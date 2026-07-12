#!/usr/bin/env python3
"""Validate agent-produced cloze items and emit web/data/grammar_<lv>.json.

Input : data/grammar_cloze_items/<lv>.json  (flat list of raw item dicts)
Output: web/data/grammar_<lv>.json          (validated, id-stamped, deduped)
"""
import glob, json, hashlib, os, re

LEVELS = ["n5", "n4", "n3", "n2", "n1"]
REQUIRED = ["category", "pattern", "meaning_zh", "before", "answer", "after",
            "distractors", "note", "ex_zh"]


def _balanced_furigana(s):
    return s.count("（") == s.count("）")


def validate(item):
    errs = []
    for k in REQUIRED:
        if k not in item:
            errs.append(f"missing key: {k}")
    if errs:
        return errs
    if not isinstance(item["before"], str) or not item["before"].strip():
        errs.append("empty before")
    if not isinstance(item["answer"], str) or not item["answer"].strip():
        errs.append("empty answer")
    if not isinstance(item["after"], str):
        errs.append("after must be a string")
    d = item["distractors"]
    if not isinstance(d, list) or len(d) != 3 or any(not isinstance(x, str) or not x.strip() for x in d):
        errs.append("distractors must be 3 non-empty strings")
    else:
        if item["answer"] in d:
            errs.append("answer appears in distractors")
        opts = [item["answer"], *d]
        if len(set(opts)) != 4:
            errs.append("options not unique")
    for field in ("before", "after"):
        if isinstance(item.get(field), str) and not _balanced_furigana(item[field]):
            errs.append(f"unbalanced furigana parens in {field}")
    return errs


def build_level(items, lv, seen):
    out = []
    for raw in items:
        errs = validate(raw)
        if errs:
            print(f"  SKIP [{lv}] {raw.get('pattern','?')}: {'; '.join(errs)}")
            continue
        key = raw["pattern"] + "|" + lv
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "id": hashlib.sha1(key.encode()).hexdigest()[:12],
            "level": lv.upper(),
            "category": raw["category"],
            "pattern": raw["pattern"],
            "meaning_zh": raw["meaning_zh"],
            "before": raw["before"],
            "answer": raw["answer"],
            "after": raw["after"],
            "distractors": raw["distractors"],
            "connection": raw.get("connection", ""),
            "note": raw["note"],
            "ex_zh": raw["ex_zh"],
        })
    return out


def main():
    os.makedirs("web/data", exist_ok=True)
    seen = set()
    for lv in LEVELS:
        path = f"data/grammar_cloze_items/{lv}.json"
        items = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
        out = build_level(items, lv, seen)
        json.dump(out, open(f"web/data/grammar_{lv}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        print(f"{lv}: emitted {len(out)} / {len(items)} raw")


if __name__ == "__main__":
    main()
