#!/usr/bin/env python3
"""Build a JLPT grammar-pattern book PDF from data/grammar_<level>_part*.json.

Usage: python3 build_grammar_pdf.py n5|n4|n3|n2

Entry schema: pattern, reading, meaning_zh, connection, ex, ex_zh, note
Japanese text uses IPAGothic; the Traditional-Chinese role uses the pan-CJK
Noto Sans CJK TC (converted OTF->TTF, shared cache with build_vocab_pdf.py).
"""
import glob
import io
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

JP = "IPAGothic"
TC = "NotoTC"
ACCENT = colors.HexColor("#7A4FA3")   # purple, to distinguish from the vocab book
GRAY = colors.HexColor("#666666")
LIGHT = colors.HexColor("#F2EEF7")

CJK_TTF = "assets/fonts/NotoSansCJKtc-Regular.ttf"
CJK_OTF = "assets/fonts/NotoSansCJKtc-Regular.otf"
CJK_OTF_URL = ("https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/"
               "TraditionalChinese/NotoSansCJKtc-Regular.otf")


def ensure_cjk_ttf():
    if os.path.exists(CJK_TTF):
        return
    os.makedirs(os.path.dirname(CJK_TTF), exist_ok=True)
    if not os.path.exists(CJK_OTF):
        print("downloading Noto Sans CJK TC ...")
        urllib.request.urlretrieve(CJK_OTF_URL, CJK_OTF)
    print("converting OTF -> TTF (one-time, ~60s) ...")
    from fontTools.ttLib import TTFont as FTFont, newTable
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib.tables._g_l_y_f import table__g_l_y_f
    f = FTFont(CJK_OTF)
    gs = f.getGlyphSet()
    order = f.getGlyphOrder()
    glyphs = {}
    for name in order:
        pen = TTGlyphPen(gs)
        gs[name].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        glyphs[name] = pen.glyph()
    glyf = table__g_l_y_f()
    glyf.glyphOrder = order
    glyf.glyphs = glyphs
    f["glyf"] = glyf
    maxp = newTable("maxp")
    maxp.tableVersion = 0x00010000
    maxp.numGlyphs = len(order)
    for a in ("maxPoints", "maxContours", "maxCompositePoints", "maxCompositeContours",
              "maxTwilightPoints", "maxStorage", "maxFunctionDefs", "maxInstructionDefs",
              "maxStackElements", "maxSizeOfInstructions", "maxComponentElements",
              "maxComponentDepth"):
        setattr(maxp, a, 0)
    maxp.maxZones = 1
    f["maxp"] = maxp
    f["loca"] = newTable("loca")
    f["head"].glyphDataFormat = 0
    for tag in ("CFF ", "CFF2", "VORG"):
        if tag in f:
            del f[tag]
    f.sfntVersion = "\x00\x01\x00\x00"
    if "post" in f:
        f["post"].formatType = 3.0
    f.save(CJK_TTF)


ensure_cjk_ttf()
pdfmetrics.registerFont(TTFont(JP, "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"))
pdfmetrics.registerFont(TTFont(TC, CJK_TTF))
pdfmetrics.registerFontFamily(JP, normal=JP, bold=JP, italic=JP, boldItalic=JP)
pdfmetrics.registerFontFamily(TC, normal=TC, bold=TC, italic=TC, boldItalic=TC)

LEVEL = (sys.argv[1] if len(sys.argv) > 1 else "n5").lower()


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _part_num(path):
    m = re.search(r"_part(\d+)\.json$", path)
    return int(m.group(1)) if m else 0


class PageProbe(Flowable):
    def __init__(self, key, sink):
        super().__init__()
        self.key = key
        self.sink = sink
        self.width = self.height = 0

    def wrap(self, *_):
        return (0, 0)

    def draw(self):
        self.sink[self.key] = self.canv.getPageNumber()


def load_data():
    categories = []
    seen = {}
    dupes = []
    paths = sorted(glob.glob(f"data/grammar_{LEVEL}_part*.json"), key=_part_num)
    if not paths:
        raise SystemExit(f"no data files matching data/grammar_{LEVEL}_part*.json")
    for path in paths:
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
        for cat in doc["categories"]:
            kept = []
            for e in cat["entries"]:
                for field in ("pattern", "meaning_zh", "connection", "ex", "ex_zh"):
                    if not e.get(field):
                        raise ValueError(f"{path}: {e.get('pattern', '?')} missing {field}")
                key = e["pattern"]
                if key in seen:
                    dupes.append((e["pattern"], seen[key], cat["category"]))
                    continue
                seen[key] = cat["category"]
                kept.append(e)
            cat["entries"] = kept
            categories.append(cat)
    return categories, dupes


class BookTemplate(BaseDocTemplate):
    def __init__(self, filename, **kw):
        super().__init__(filename, pagesize=A4, **kw)
        margin = 18 * mm
        frame = Frame(margin, margin, A4[0] - 2 * margin, A4[1] - 2 * margin, id="main")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[frame]),
            PageTemplate(id="body", frames=[frame], onPage=self.draw_footer),
        ])

    def draw_footer(self, canvas, doc):
        canvas.saveState()
        canvas.setFont(TC, 8)
        canvas.setFillColor(GRAY)
        canvas.drawCentredString(A4[0] / 2, 10 * mm, f"- {doc.page} -")
        canvas.drawString(18 * mm, A4[1] - 12 * mm, f"JLPT {LEVEL.upper()} 文法句型書")
        canvas.setFillColor(ACCENT)
        canvas.line(18 * mm, A4[1] - 14 * mm, A4[0] - 18 * mm, A4[1] - 14 * mm)
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "CatHeading":
            text = flowable.getPlainText()
            self.notify("TOCEntry", (0, text, self.page))
            self.canv.bookmarkPage(text)
            self.canv.addOutlineEntry(text, text, 0)
        elif isinstance(flowable, Paragraph) and flowable.style.name == "IdxHeading":
            self.canv.bookmarkPage("index")
            self.canv.addOutlineEntry("索引", "index", 0)


S = {
    "title": ParagraphStyle("title", fontName=TC, fontSize=28, leading=38,
                            alignment=1, textColor=ACCENT),
    "subtitle": ParagraphStyle("subtitle", fontName=TC, fontSize=13, leading=20,
                               alignment=1, textColor=GRAY),
    "toc_title": ParagraphStyle("toc_title", fontName=TC, fontSize=18, leading=26,
                                textColor=ACCENT, spaceAfter=8),
    "cat": ParagraphStyle("CatHeading", fontName=TC, fontSize=15, leading=21,
                          textColor=colors.white, backColor=ACCENT,
                          borderPadding=(4, 8, 5, 8), spaceBefore=6, spaceAfter=10),
    "idx_title": ParagraphStyle("IdxHeading", fontName=TC, fontSize=15, leading=21,
                                textColor=colors.white, backColor=ACCENT,
                                borderPadding=(4, 8, 5, 8), spaceBefore=6, spaceAfter=10),
    "pattern": ParagraphStyle("pattern", fontName=JP, fontSize=14, leading=18, wordWrap="CJK"),
    "meaning": ParagraphStyle("meaning", fontName=TC, fontSize=11, leading=15, wordWrap="CJK"),
    "conn": ParagraphStyle("conn", fontName=TC, fontSize=9.5, leading=13,
                           textColor=colors.HexColor("#555555"), wordWrap="CJK"),
    "ex": ParagraphStyle("ex", fontName=JP, fontSize=10.5, leading=16, wordWrap="CJK"),
    "ex_zh": ParagraphStyle("ex_zh", fontName=TC, fontSize=9.5, leading=13,
                            textColor=GRAY, wordWrap="CJK"),
    "note": ParagraphStyle("note", fontName=TC, fontSize=9, leading=12.5,
                           textColor=colors.HexColor("#7A4FA3"), wordWrap="CJK"),
    "idx_row": ParagraphStyle("idx_row", fontName=TC, fontSize=13, leading=18,
                              textColor=colors.white, backColor=ACCENT,
                              borderPadding=(2, 6, 3, 6), spaceBefore=8, spaceAfter=4),
    "idx_word": ParagraphStyle("idx_word", fontName=JP, fontSize=9.5, leading=13, wordWrap="CJK"),
    "idx_page": ParagraphStyle("idx_page", fontName=TC, fontSize=9.5, leading=13,
                               alignment=2, textColor=ACCENT),
}

GOJUON = [
    ("あ", "あいうえお"), ("か", "かがきぎくぐけげこご"),
    ("さ", "さざしじすずせぜそぞ"), ("た", "ただちぢつづてでとど"),
    ("な", "なにぬねの"), ("は", "はばぱひびぴふぶぷへべぺほぼぽ"),
    ("ま", "まみむめも"), ("や", "やゆよ"), ("ら", "らりるれろ"), ("わ", "わゐゑをん"),
]
_SMALL = str.maketrans("ぁぃぅぇぉっゃゅょゎ", "あいうえおつやゆよわ")


def _kata_to_hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def _sort_key(pattern, reading):
    base = reading or pattern
    base = base.lstrip("〜~ 　").replace("・", "")
    base = _kata_to_hira(base)
    base = "".join(ch for ch in base if ch >= "ぁ")  # drop 〜, punctuation, kanji-leading
    return (base.translate(_SMALL).replace("ー", ""), pattern)


def _row_label(pattern, reading):
    k = _sort_key(pattern, reading)[0]
    first = k[0] if k else ""
    for label, chars in GOJUON:
        if first in chars:
            return label
    return "その他"


def build_index_flowables(index_pages):
    rows = defaultdict(list)
    for (pattern, reading), page in index_pages.items():
        rows[_row_label(pattern, reading)].append((pattern, page))
    flow = [Paragraph("索引（五十音順）", S["idx_title"]), Spacer(1, 2 * mm)]
    order = [lbl for lbl, _ in GOJUON] + ["その他"]
    NCOL, patt_w, page_w = 2, 72 * mm, 10 * mm
    for label in order:
        items = rows.get(label)
        if not items:
            continue
        items.sort(key=lambda t: _sort_key(t[0], ""))
        flow.append(Paragraph(label, S["idx_row"]))
        cells = []
        for pattern, page in items:
            cells.append(Paragraph(esc(pattern), S["idx_word"]))
            cells.append(Paragraph(str(page), S["idx_page"]))
        per_row = NCOL * 2
        while len(cells) % per_row:
            cells.append("")
        data = [cells[i:i + per_row] for i in range(0, len(cells), per_row)]
        tbl = Table(data, colWidths=[patt_w, page_w] * NCOL)
        tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 1),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
        flow.append(tbl)
    return flow


def entry_flowable(idx, e, sink):
    num = f'<font color="#999999" size="9">{idx:03d}</font>'
    reading = e.get("reading") or ""
    rd = f'　<font name="{JP}" size="9" color="#888888">{esc(reading)}</font>' if reading else ""
    pattern = f'{num}&nbsp;&nbsp;<b>{esc(e["pattern"])}</b>{rd}'
    header = Table(
        [[Paragraph(pattern, S["pattern"]), Paragraph(esc(e["meaning_zh"]), S["meaning"])]],
        colWidths=[108 * mm, 66 * mm],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]),
    )
    conn = Paragraph(f'<b>接續</b>　{esc(e["connection"])}', S["conn"])
    ex_rows = [
        [Paragraph("例", ParagraphStyle("exmark", fontName=TC, fontSize=9,
                                        textColor=colors.white, alignment=1)),
         Paragraph(esc(e["ex"]), S["ex"])],
        ["", Paragraph(esc(e["ex_zh"]), S["ex_zh"])],
    ]
    ex = Table(ex_rows, colWidths=[8 * mm, 166 * mm],
               style=TableStyle([
                   ("BACKGROUND", (0, 0), (0, 0), ACCENT),
                   ("BACKGROUND", (1, 0), (1, -1), LIGHT),
                   ("VALIGN", (0, 0), (-1, -1), "TOP"),
                   ("LEFTPADDING", (1, 0), (1, -1), 8),
                   ("TOPPADDING", (0, 0), (-1, 0), 3),
                   ("BOTTOMPADDING", (0, -1), (-1, -1), 4),
               ]))
    parts = [[header], [conn], [ex]]
    if e.get("note"):
        parts.append([Paragraph(f'<b>※</b>　{esc(e["note"])}', S["note"])])
    block = Table(parts, colWidths=[174 * mm],
                  style=TableStyle([
                      ("LEFTPADDING", (0, 0), (-1, -1), 0),
                      ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                      ("TOPPADDING", (0, 0), (-1, -1), 1),
                      ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                      ("LINEBELOW", (0, -1), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
                  ]))
    probe = PageProbe((e["pattern"], reading), sink)
    return KeepTogether([block, Spacer(1, 5), probe])


def make_content_story(categories, total, sink):
    story = [
        Spacer(1, 70 * mm),
        Paragraph(f"JLPT {LEVEL.upper()} 文法句型書", S["title"]),
        Spacer(1, 8 * mm),
        Paragraph(f"共 {total} 句型　·　接續／中文解說／例句（附假名）", S["subtitle"]),
        Paragraph(f"{date.today():%Y-%m-%d}", S["subtitle"]),
        NextPageTemplate("body"),
        PageBreak(),
        Paragraph("目錄", S["toc_title"]),
    ]
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle("toc0", fontName=TC, fontSize=11, leading=18)]
    story += [toc, PageBreak()]
    idx = 0
    for ci, cat in enumerate(categories):
        if ci:
            story.append(PageBreak())
        story.append(Paragraph(
            f'{esc(cat["category"])}（{len(cat["entries"])} 句型）', S["cat"]))
        for e in cat["entries"]:
            idx += 1
            story.append(entry_flowable(idx, e, sink))
    return story


def main():
    categories, dupes = load_data()
    total = sum(len(c["entries"]) for c in categories)
    if dupes:
        print(f"NOTE: skipped {len(dupes)} duplicate patterns:")
        for w, first_cat, cat in dupes:
            print(f"  {w}  (kept in「{first_cat}」, dropped from「{cat}」)")

    out = f"{LEVEL.upper()}文法句型書.pdf"
    index_pages = {}
    BookTemplate(io.BytesIO()).multiBuild(make_content_story(categories, total, index_pages))
    missing = total - len(index_pages)

    story = make_content_story(categories, total, {})
    story.append(PageBreak())
    story += build_index_flowables(index_pages)
    BookTemplate(out).multiBuild(story)
    note = f" ({missing} missing page refs)" if missing else ""
    print(f"OK: {out} — {total} patterns, {len(categories)} categories, "
          f"{len(index_pages)} indexed{note}")


if __name__ == "__main__":
    main()
