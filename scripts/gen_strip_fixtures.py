#!/usr/bin/env python3
"""Generate raw (single-normalization) strip fixtures for the JS unit tests.

Renders real digit rows with the same fonts/augmentation used for training,
writes tests/fixtures/stripFixtures.json. The model file is untouched.
"""

import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import train_digit_cnn as t

ROOT = Path(__file__).resolve().parent.parent

STRIPS = [
    [4, 4, 0, 0, 9],
    [8, 2, 1, 7, 5],
    [9, 6, 1, 2, 3],
    [5, 0, 1, 3, 6],
]


def render_strip(digits, rotation=4.0):
    font_path = t.FONTS[int(t.rng.integers(0, len(t.FONTS)))]
    size = int(t.rng.integers(46, 72))
    font = ImageFont.truetype(font_path, size)
    pad = 10
    cell = int(size * 1.5)
    row_h = cell + pad * 2
    S = cell * len(digits) + pad * (len(digits) + 1)
    img = Image.new("L", (S, row_h), 255)
    d = ImageDraw.Draw(img)
    mid = row_h // 2
    for i, dig in enumerate(digits):
        cx = pad + i * cell + cell // 2
        ang = float(t.rng.uniform(-rotation, rotation))
        glyph = Image.new("L", (cell, row_h), 255)
        gd = ImageDraw.Draw(glyph)
        gd.text((cell // 2, mid), str(dig), font=font, fill=0, anchor="mm")
        glyph = glyph.rotate(ang, resample=Image.Resampling.BICUBIC, fillcolor=255)
        d._image.paste(glyph, (cx - cell // 2, 0))
    if t.rng.random() < 0.7:
        img = img.filter(ImageFilter.GaussianBlur(float(t.rng.uniform(0, 1.2))))
    arr = np.asarray(img, dtype=np.float32)
    threshold = float(t.rng.uniform(125, 170))
    return (arr < threshold).astype(np.float32), list(digits)


def main():
    out = []
    for digits in STRIPS:
        bin_, expected = render_strip(digits)
        out.append(
            {
                "expected": "".join(str(d) for d in expected),
                "width": int(bin_.shape[1]),
                "height": int(bin_.shape[0]),
                "data": bin_.astype(int).tolist(),
            }
        )
    path = ROOT / "tests" / "fixtures" / "stripFixtures.json"
    path.write_text(json.dumps(out))
    print(f"Wrote {path} ({len(out)} strips)")


if __name__ == "__main__":
    main()
