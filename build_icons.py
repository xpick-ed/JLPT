#!/usr/bin/env python3
"""Generate PWA icons: a vermilion 字-hanko. Run once; commit web/icons/*.png."""
import os
from PIL import Image, ImageDraw, ImageFont

FONT = "assets/fonts/NotoSansCJKtc-Regular.ttf"
SHU = (229, 68, 47)            # #e5442f
WHITE = (255, 255, 255, 255)
OUT = "web/icons"


def make(size, glyph_frac, radius_frac, full_bleed, keep_alpha):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if full_bleed:
        d.rectangle([0, 0, size, size], fill=SHU + (255,))
    else:
        r = int(size * radius_frac)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=SHU + (255,))
    font = ImageFont.truetype(FONT, int(size * glyph_frac))
    bbox = d.textbbox((0, 0), "字", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), "字", font=font, fill=WHITE)
    if keep_alpha:
        return img
    flat = Image.new("RGB", (size, size), SHU)   # apple-touch: no alpha
    flat.paste(img, (0, 0), img)
    return flat


def main():
    os.makedirs(OUT, exist_ok=True)
    make(192, 0.62, 0.22, False, True).save(f"{OUT}/icon-192.png")
    make(512, 0.62, 0.22, False, True).save(f"{OUT}/icon-512.png")
    make(512, 0.55, 0.0, True, True).save(f"{OUT}/icon-maskable-512.png")
    make(180, 0.62, 0.0, True, False).save(f"{OUT}/apple-touch-icon.png")
    print("wrote:", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
