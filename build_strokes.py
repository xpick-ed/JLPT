#!/usr/bin/env python3
"""Build web/data/strokes_<level>.json — kanji → ordered stroke paths.

Source: KanjiVG (https://kanjivg.tagaini.net, CC BY-SA 3.0). Point --kanjivg at
an unzipped release's kanji/ directory; every kanji used by a level's vocabulary
words is emitted once, at the lowest level that uses it (same dedup rule as the
vocab decks). Paths are the raw SVG `d` strings in the 109×109 KanjiVG viewBox.
"""
import argparse, json, os, re

LEVELS = ["n5", "n4", "n3", "n2", "n1"]
STROKE_RE = re.compile(r'<path[^>]*\bid="kvg:[^"]*-s\d+[^"]*"[^>]*\bd="([^"]+)"')
D_FIRST_RE = re.compile(r'\bd="([^"]+)"')


def kanji_of(word):
    return [ch for ch in word if "一" <= ch <= "鿿"]


def strokes_for(kanjivg_dir, ch):
    path = os.path.join(kanjivg_dir, f"{ord(ch):05x}.svg")
    if not os.path.exists(path):
        return None
    svg = open(path, encoding="utf-8").read()
    strokes = STROKE_RE.findall(svg)
    if not strokes:  # fallback: any path elements in order
        strokes = D_FIRST_RE.findall(svg)
    return strokes or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kanjivg", required=True, help="path to KanjiVG kanji/ dir")
    args = ap.parse_args()

    seen = set()
    total = missing = 0
    for lv in LEVELS:
        deck = json.load(open(f"web/data/{lv}.json", encoding="utf-8"))
        out = {}
        for card in deck:
            for ch in kanji_of(card["word"]):
                if ch in seen:
                    continue
                seen.add(ch)
                total += 1
                s = strokes_for(args.kanjivg, ch)
                if s:
                    out[ch] = s
                else:
                    missing += 1
        out["_license"] = "KanjiVG (kanjivg.tagaini.net), CC BY-SA 3.0"
        json.dump(out, open(f"web/data/strokes_{lv}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        print(f"{lv}: {len(out) - 1} kanji")
    print(f"total {total}, missing {missing}")


if __name__ == "__main__":
    main()
