#!/usr/bin/env python3
"""Build web/data/<level>.json from data/(n*)_part*.json for the vocab game."""
import glob, json, hashlib, os, re

LEVELS = ["n5", "n4", "n3", "n2", "n1"]

def _pn(p):
    m = re.search(r"_part(\d+)\.json$", p)
    return int(m.group(1)) if m else 0

def main():
    os.makedirs("web/data", exist_ok=True)
    seen = set()  # word|kana already emitted at a lower level
    for lv in LEVELS:
        out = []
        for path in sorted(glob.glob(f"data/{lv}_part*.json"), key=_pn):
            doc = json.load(open(path, encoding="utf-8"))
            for cat in doc["categories"]:
                for e in cat["entries"]:
                    key = e["word"] + "|" + e["kana"]
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append({
                        "id": hashlib.sha1(key.encode()).hexdigest()[:12],
                        "level": lv.upper(),
                        "category": cat["category"],
                        "word": e["word"], "kana": e["kana"], "romaji": e["romaji"],
                        "pos": e["pos"], "zh": e["zh"], "ex": e["ex"], "ex_zh": e["ex_zh"],
                    })
        json.dump(out, open(f"web/data/{lv}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        print(f"{lv}: {len(out)} cards")

if __name__ == "__main__":
    main()
