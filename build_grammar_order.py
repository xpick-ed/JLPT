#!/usr/bin/env python3
"""Validate agent-produced sentence-ordering items and emit web/data/grammar_order_<lv>.json.

Input : data/grammar_order_items/<lv>.json  (flat list of raw item dicts)
Output: web/data/grammar_order_<lv>.json     (validated, id-stamped, deduped)
"""
import glob, json, hashlib, os

LEVELS = ["n5", "n4", "n3", "n2", "n1"]
REQUIRED = ["category", "pattern", "before", "frags", "after",
            "connection", "note", "ex_zh"]


def _balanced(s):
    return s.count("（") == s.count("）")


def validate(item):
    errs = []
    for k in REQUIRED:
        if k not in item:
            errs.append(f"missing key: {k}")
    if errs:
        return errs
    f = item["frags"]
    if not isinstance(f, list) or len(f) != 4 or any(not isinstance(x, str) or not x.strip() for x in f):
        errs.append("frags must be 4 non-empty strings")
    elif len(set(f)) != 4:
        errs.append("frags must be distinct")
    for field in ("before", "after"):
        if not isinstance(item.get(field), str):
            errs.append(f"{field} must be a string")
        elif not _balanced(item[field]):
            errs.append(f"unbalanced furigana parens in {field}")
    if isinstance(f, list) and all(isinstance(x, str) for x in f):
        if not _balanced("".join(f)):
            errs.append("unbalanced furigana parens in frags")
    return errs


def _full(item):
    return item["before"] + "".join(item["frags"]) + item["after"]


def build_level(items, lv, seen):
    out = []
    for raw in items:
        errs = validate(raw)
        if errs:
            print(f"  SKIP [{lv}] {raw.get('pattern','?')}: {'; '.join(errs)}")
            continue
        key = "order|" + _full(raw) + "|" + lv
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "id": hashlib.sha1(key.encode()).hexdigest()[:12],
            "level": lv.upper(),
            "category": raw["category"],
            "pattern": raw["pattern"],
            "before": raw["before"],
            "frags": raw["frags"],
            "after": raw["after"],
            "connection": raw.get("connection", ""),
            "note": raw["note"],
            "ex_zh": raw["ex_zh"],
        })
    return out


def main():
    os.makedirs("web/data", exist_ok=True)
    seen = set()
    for lv in LEVELS:
        path = f"data/grammar_order_items/{lv}.json"
        items = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
        out = build_level(items, lv, seen)
        json.dump(out, open(f"web/data/grammar_order_{lv}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        print(f"{lv}: emitted {len(out)} / {len(items)} raw")


if __name__ == "__main__":
    main()
