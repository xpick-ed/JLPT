#!/usr/bin/env python3
"""Build web/data/<level>.json from data/(n*)_part*.json for the vocab game."""
import glob, json, hashlib, os, re

LEVELS = ["n5", "n4", "n3", "n2", "n1"]

def _pn(p):
    m = re.search(r"_part(\d+)\.json$", p)
    return int(m.group(1)) if m else 0

def load_pitch(path="data/pitch_accents.tsv"):
    """(word, kana) -> accent number, filtered from kanjium (CC BY-SA)."""
    acc = {}
    if not os.path.exists(path):
        return acc
    for line in open(path, encoding="utf-8"):
        if line.startswith("#"):
            continue
        parts = line.rstrip("\n").split("\t")
        if len(parts) == 3 and parts[2].isdigit():
            acc[(parts[0], parts[1])] = int(parts[2])
    return acc

def main():
    os.makedirs("web/data", exist_ok=True)
    pitch = load_pitch()
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
                    card = {
                        "id": hashlib.sha1(key.encode()).hexdigest()[:12],
                        "level": lv.upper(),
                        "category": cat["category"],
                        "word": e["word"], "kana": e["kana"], "romaji": e["romaji"],
                        "pos": e["pos"], "zh": e["zh"], "ex": e["ex"], "ex_zh": e["ex_zh"],
                    }
                    # IDs hash only word|kana, so this extra field is ID-stable.
                    a = pitch.get((e["word"], e["kana"]))
                    if a is not None:
                        card["acc"] = a
                    out.append(card)
        json.dump(out, open(f"web/data/{lv}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        print(f"{lv}: {len(out)} cards")

if __name__ == "__main__":
    main()
