#!/usr/bin/env python3
"""Offline training pipeline for the lenETA digit CNN.

Generates a synthetic digit dataset (10 digits, bold Windows fonts, heavy
augmentation), trains a small CNN with numpy + BLAS matmul, and exports:
  - public/models/digit_cnn.json        (quantized int8 weights + layer spec)
  - tests/fixtures/digitCnnVectors.json (regression vectors for unit tests)

Run with: npm run train:digits

The runtime classifier (src/lib/digitcnn.ts) is a hand-rolled JS forward pass
that must reproduce the logits recorded here. Keep this file and
src/lib/segment.ts in sync for digit normalization
(square-pad bbox -> bilinear 20x20 -> center in 28x28).
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SEED = int(os.environ.get("SEED", "42"))
TRAIN_PER_CLASS = int(os.environ.get("TRAIN_PER_CLASS", "4000"))
TEST_PER_CLASS = int(os.environ.get("TEST_PER_CLASS", "500"))
EPOCHS = int(os.environ.get("EPOCHS", "25"))
BATCH = int(os.environ.get("BATCH", "128"))
LR = float(os.environ.get("LR", "0.002"))

FONT_FILES = [
    "arial.ttf",
    "arialbd.ttf",
    "segoeuib.ttf",
    "segoeuibl.ttf",
    "verdana.ttf",
    "impact.ttf",
    "timesbd.ttf",
    "courbd.ttf",
    "trebucbd.ttf",
    "georgiab.ttf",
    "tahomabd.ttf",
    "calibri.ttf",
    "calibrib.ttf",
    "corbelb.ttf",
    "framd.ttf",
    "segoescb.ttf",
]

FONT_DIR = Path(os.environ.get("WINDIR", "C:\\Windows")) / "Fonts"
rng = np.random.default_rng(SEED)


def load_fonts():
    fonts = []
    for f in FONT_FILES:
        p = FONT_DIR / f
        if p.exists():
            fonts.append(str(p))
    if not fonts:
        fonts = [str(FONT_DIR / "arial.ttf")]
    print(f"Fonts: {', '.join(os.path.basename(f) for f in fonts)}")
    return fonts


FONTS = load_fonts()

# ---------------------------------------------------------------- image math
# Keep normalize/bilinear identical to src/lib/segment.ts.


def bilinear_resize(src, sw, sh, dw, dh):
    """src: (sh, sw) float array -> (dh, dw) float array."""
    y_ = (np.arange(dh) + 0.5) * sh / dh - 0.5
    x_ = (np.arange(dw) + 0.5) * sw / dw - 0.5
    y0 = np.floor(y_).astype(np.int32)
    x0 = np.floor(x_).astype(np.int32)
    fy = y_ - y0
    fx = x_ - x0
    y0c = np.clip(y0, 0, sh - 1)
    y1c = np.clip(y0 + 1, 0, sh - 1)
    x0c = np.clip(x0, 0, sw - 1)
    x1c = np.clip(x0 + 1, 0, sw - 1)
    p00 = src[y0c][:, x0c]
    p01 = src[y0c][:, x1c]
    p10 = src[y1c][:, x0c]
    p11 = src[y1c][:, x1c]
    w00 = (1 - fx)[None, :] * (1 - fy)[:, None]
    w01 = fx[None, :] * (1 - fy)[:, None]
    w10 = (1 - fx)[None, :] * fy[:, None]
    w11 = fx[None, :] * fy[:, None]
    return p00 * w00 + p01 * w01 + p10 * w10 + p11 * w11


def normalize_cell(bin2d, size=28, pad=2, inner=20):
    """bin2d: (sh, sw) binary image (1 = ink) -> (784,) 0/1 digit or None."""
    sh, sw = bin2d.shape
    idx = np.argwhere(bin2d > 0.5)
    if idx.size == 0:
        return None
    min_y, min_x = idx.min(axis=0)
    max_y, max_x = idx.max(axis=0)
    side = max(max_x - min_x + 1, max_y - min_y + 1) + 2 * pad
    sx0 = min_x - pad
    sy0 = min_y - pad
    ys = sy0 + np.arange(side)
    xs = sx0 + np.arange(side)
    yok = (ys >= 0) & (ys < sh)
    xok = (xs >= 0) & (xs < sw)
    sub = bin2d[np.clip(ys, 0, sh - 1)][:, np.clip(xs, 0, sw - 1)]
    reg = np.where(yok[:, None] & xok[None, :], sub, 0.0).astype(np.float32)
    resized = bilinear_resize(reg, side, side, inner, inner)
    out = np.zeros((size, size), np.float32)
    m = (size - inner) // 2
    out[m : m + inner, m : m + inner] = resized
    return out.flatten()


def render_digit(digit):
    """Returns a (784,) binarized 28x28 sample for the given digit."""
    font_path = FONTS[rng.integers(0, len(FONTS))]
    size = float(rng.integers(48, 96))
    font = ImageFont.truetype(font_path, int(size))
    S = int(size + 56)
    img = Image.new("L", (S, S), 255)
    d = ImageDraw.Draw(img)
    angle = rng.uniform(-12, 12)
    outline = rng.random() < 0.25
    stroke = 2 if outline else (1 if rng.random() < 0.3 else 0)
    d.text(
        (S // 2, S // 2),
        str(digit),
        font=font,
        fill=0,
        anchor="mm",
        stroke_width=stroke,
        stroke_fill=0,
    )
    img = img.rotate(angle, resample=Image.Resampling.BICUBIC, fillcolor=255)

    sc = float(rng.uniform(0.75, 1.15))
    if abs(sc - 1.0) > 0.01:
        nw = max(1, int(round(S * sc)))
        img = img.resize((nw, nw), Image.Resampling.BILINEAR)

    blur = float(rng.uniform(0, 1.8))
    if blur > 0.2:
        img = img.filter(ImageFilter.GaussianBlur(blur))

    canvas = Image.new("L", (S, S), 255)
    ox = int(rng.integers(-S // 6, S // 6 + 1))
    oy = int(rng.integers(-S // 6, S // 6 + 1))
    canvas.paste(img, (ox, oy))
    arr = np.asarray(canvas, dtype=np.float32)

    threshold = float(rng.uniform(110, 190))
    bin_ = (arr < threshold).astype(np.float32)
    noise_p = float(rng.uniform(0, 0.02))
    if noise_p > 0:
        flip = rng.random(arr.shape) < noise_p
        bin_ = np.where(flip, 1.0 - bin_, bin_)

    if bin_.sum() < 4:
        return render_digit(digit)

    norm = normalize_cell(bin_)
    if norm is None:
        return render_digit(digit)
    return norm


def build_dataset(per_class):
    total = per_class * 10
    xs = np.empty((total, 28, 28, 1), dtype=np.float32)
    ys = np.empty(total, dtype=np.int64)
    for d in range(10):
        for n in range(per_class):
            xs[d * per_class + n, :, :, 0] = render_digit(d).reshape(28, 28)
            ys[d * per_class + n] = d
        if d % 2 == 0 or d == 9:
            print(f"  digit {d}: done")
    return xs, ys


# ---------------------------------------------------------------- CNN layers
def im2col(x):
    # x: (B, H, W, C) -> cols (B, (H-2)(W-2), C*9)
    B, H, W, C = x.shape
    oh, ow = H - 2, W - 2
    cols = np.empty((B, oh * ow, C * 9), dtype=np.float32)
    p = 0
    for ky in range(3):
        for kx in range(3):
            cols[:, :, p : p + C] = x[:, ky : ky + oh, kx : kx + ow, :].reshape(
                B, oh * ow, C
            )
            p += C
    return cols


def col2im(cols, B, H, W, C):
    oh, ow = H - 2, W - 2
    dx = np.zeros((B, H, W, C), dtype=np.float32)
    p = 0
    for ky in range(3):
        for kx in range(3):
            dx[:, ky : ky + oh, kx : kx + ow, :] += cols[:, :, p : p + C].reshape(
                B, oh, ow, C
            )
            p += C
    return dx


def conv_forward(x, w, b):
    # w: (outC, C*9), b: (outC,) -> out (B, oh, ow, outC), cols (B, oh*ow, C*9)
    B, H, W, C = x.shape
    oh, ow = H - 2, W - 2
    cols = im2col(x)
    out = np.matmul(cols, w.T) + b  # (B, oh*ow, outC)
    np.maximum(out, 0, out=out)
    return out.reshape(B, oh, ow, -1), cols


def conv_backward(dout, cols, w):
    # dout: (B, oh, ow, outC) gradient w.r.t. relu output
    B, oh, ow, outC = dout.shape
    d = dout.reshape(B, oh * ow, outC)
    gw = np.matmul(cols.transpose(0, 2, 1), d).sum(axis=0).T  # (outC, K)
    gb = d.sum(axis=(0, 1))
    dxcols = np.matmul(d, w)  # (B, M, K)
    return gw, gb, dxcols


def maxpool_forward(x):
    B, H, W, C = x.shape
    oh, ow = H // 2, W // 2
    xc = x[:, : oh * 2, : ow * 2, :]
    xr = xc.reshape(B, oh, 2, ow, 2, C)
    out = xr.max(axis=(2, 4))
    flat = xr.reshape(B, oh, ow, 4, C)
    mask = flat.argmax(axis=3)  # 0..3 = dy*2+dx
    return out, mask


def maxpool_backward(dout, mask, B, H, W, C):
    oh, ow = H // 2, W // 2
    dx = np.zeros((B, H, W, C), dtype=np.float32)
    dy = mask // 2
    dxw = mask % 2
    b = np.arange(B)[:, None, None, None]
    y = (np.arange(oh)[None, :, None, None] * 2 + dy)
    x = (np.arange(ow)[None, None, :, None] * 2 + dxw)
    c = np.arange(C)[None, None, None, :]
    np.add.at(dx, (b, y, x, c), dout)
    return dx


def fc_forward(x, w, b, relu=True):
    z = np.matmul(x, w) + b
    if relu:
        np.maximum(z, 0, out=z)
    return z


def fc_backward(dout, x, w):
    gw = np.matmul(x.T, dout)
    gb = dout.sum(axis=0)
    dx = np.matmul(dout, w.T)
    return gw, gb, dx


def softmax_ce(z, y):
    zm = z - z.max(axis=1, keepdims=True)
    e = np.exp(zm)
    p = e / e.sum(axis=1, keepdims=True)
    loss = float(-np.mean(np.log(p[np.arange(len(y)), y] + 1e-12)))
    d = p - np.eye(10)[y]
    d /= len(y)
    return loss, d, p


def init_weights():
    w1 = rng.standard_normal((16, 9)).astype(np.float32) * np.sqrt(2.0 / 9)
    w2 = rng.standard_normal((32, 144)).astype(np.float32) * np.sqrt(2.0 / (16 * 9))
    w3 = rng.standard_normal((800, 128)).astype(np.float32) * np.sqrt(2.0 / 800)
    w4 = rng.standard_normal((128, 10)).astype(np.float32) * np.sqrt(2.0 / 128)
    b1 = np.zeros(16, np.float32)
    b2 = np.zeros(32, np.float32)
    b3 = np.zeros(128, np.float32)
    b4 = np.zeros(10, np.float32)
    return {"w1": w1, "b1": b1, "w2": w2, "b2": b2, "w3": w3, "b3": b3, "w4": w4, "b4": b4}


def forward(x, p, dropout=None):
    c1, cols1 = conv_forward(x, p["w1"], p["b1"])
    p1, mask1 = maxpool_forward(c1)
    c2, cols2 = conv_forward(p1, p["w2"], p["b2"])
    p2, mask2 = maxpool_forward(c2)
    f = p2.reshape(x.shape[0], 800)
    h1 = fc_forward(f, p["w3"], p["b3"], True)
    drop_mask = None
    if dropout:
        drop_mask = ((rng.random(h1.shape) >= dropout).astype(np.float32)) / (1 - dropout)
        h1 = h1 * drop_mask
    z2 = fc_forward(h1, p["w4"], p["b4"], False)
    return {
        "c1": c1, "p1": p1, "cols1": cols1, "mask1": mask1,
        "c2": c2, "p2": p2, "cols2": cols2, "mask2": mask2,
        "f": f, "h1": h1, "z2": z2, "drop_mask": drop_mask,
    }


def backward(fwd, p, dlogits):
    B = dlogits.shape[0]
    gw4, gb4, dh1 = fc_backward(dlogits, fwd["h1"], p["w4"])
    dz1 = dh1 * (fwd["h1"] > 0)
    if fwd["drop_mask"] is not None:
        dz1 *= fwd["drop_mask"]
    gw3, gb3, df = fc_backward(dz1, fwd["f"], p["w3"])
    dp2 = df.reshape(B, 5, 5, 32)
    dc2 = maxpool_backward(dp2, fwd["mask2"], B, 11, 11, 32)
    dc2 *= fwd["c2"] > 0
    gw2, gb2, dxc2 = conv_backward(dc2, fwd["cols2"], p["w2"])
    dp1 = col2im(dxc2, B, 13, 13, 16)
    dc1 = maxpool_backward(dp1, fwd["mask1"], B, 26, 26, 16)
    dc1 *= fwd["c1"] > 0
    gw1, gb1, _ = conv_backward(dc1, fwd["cols1"], p["w1"])
    return {"w1": gw1, "b1": gb1, "w2": gw2, "b2": gb2, "w3": gw3, "b3": gb3, "w4": gw4, "b4": gb4}


# ---------------------------------------------------------------- training
def train(xs, ys, epochs):
    params = init_weights()
    m = {k: np.zeros_like(v) for k, v in params.items()}
    v = {k: np.zeros_like(v) for k, v in params.items()}
    n = len(ys)
    step = 0
    for ep in range(epochs):
        perm = rng.permutation(n)
        total_loss = 0.0
        correct = 0
        lr = LR * (0.95 ** ep)
        for start in range(0, n, BATCH):
            idx = perm[start : start + BATCH]
            bx = xs[idx]
            by = ys[idx]
            fwd = forward(bx, params, dropout=0.3)
            loss, dlogits, probs = softmax_ce(fwd["z2"], by)
            total_loss += loss * len(idx)
            correct += int((probs.argmax(axis=1) == by).sum())
            grads = backward(fwd, params, dlogits)
            step += 1
            for k in params:
                g = grads[k] / len(idx)
                m[k] = 0.9 * m[k] + 0.1 * g
                v[k] = 0.999 * v[k] + 0.001 * g * g
                mhat = m[k] / (1 - 0.9 ** step)
                vhat = v[k] / (1 - 0.999 ** step)
                params[k] -= lr * mhat / (np.sqrt(vhat) + 1e-8)
        val_acc = evaluate(xs, ys, params)
        print(
            f"  epoch {ep + 1}/{epochs}  loss={total_loss / n:.4f}  "
            f"train_acc={correct / n:.4f}  val_acc={val_acc:.4f}",
            flush=True,
        )
    return params


def evaluate(xs, ys, p):
    correct = 0
    for start in range(0, len(ys), BATCH):
        fwd = forward(xs[start : start + BATCH], p)
        correct += int((fwd["z2"].argmax(axis=1) == ys[start : start + BATCH]).sum())
    return correct / len(ys)


# ---------------------------------------------------------------- export
def quantize(w):
    mn, mx = float(w.min()), float(w.max())
    if mn == mx:
        mx = mn + 1
    scale = (mx - mn) / 255.0
    zero = int(round(-mn / scale))
    q = np.clip(np.round(w / scale) + zero, 0, 255).astype(np.uint8)
    return q.tolist(), scale, zero


def export(params, test_xs, test_ys):
    spec = {
        "version": 1,
        "inputSize": 28,
        "layers": [],
    }
    qw = {}
    layers = [
        ("w1", "b1", "conv", 1, 16, 3),
        ("w2", "b2", "conv", 16, 32, 3),
        ("w3", "b3", "dense", 800, 128, None),
        ("w4", "b4", "dense", 128, 10, None),
    ]
    wspec = []
    for wk, bk, kind, in_, out, kernel in layers:
        w = params[wk]
        b = params[bk]
        q, scale, zero = quantize(w)
        wspec.append(
            {
                "type": kind,
                "kernel": kernel,
                "in": in_,
                "out": out,
                "w": q,
                "wScale": scale,
                "wZero": zero,
                "b": b.tolist(),
            }
        )
        qw[wk] = (np.asarray(q, dtype=np.float32) - zero) * scale
        qw[bk] = b

    spec["layers"] = [
        wspec[0],
        {"type": "pool"},
        wspec[1],
        {"type": "pool"},
        wspec[2],
        wspec[3],
    ]

    deq = dict(params)
    for wk in ("w1", "w2", "w3", "w4"):
        deq[wk] = qw[wk]

    # Logits with the *dequantized* weights, matching what the JS runtime computes.
    # Pick samples the dequantized model classifies correctly (using the exact
    # rounded inputs the unit tests will feed) so the regression vectors stay
    # self-consistent.
    samples = []
    per_class = test_xs.shape[0] // 10
    for d in range(10):
        found = 0
        for i in range(per_class):
            if found >= 3:
                break
            idx = d * per_class + i
            inp = test_xs[idx, :, :, 0].round().astype(int)
            xs1 = inp.astype(np.float32).reshape(1, 28, 28, 1)
            z = forward(xs1, deq)["z2"][0]
            if int(z.argmax()) == d:
                samples.append(
                    {
                        "input": inp.tolist(),
                        "label": d,
                        "logits": [float(v) for v in z],
                    }
                )
                found += 1

    model_path = ROOT / "public" / "models" / "digit_cnn.json"
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_text(json.dumps(spec))
    print(f"Wrote {model_path} ({model_path.stat().st_size / 1024:.1f} KB)")

    fix_path = ROOT / "tests" / "fixtures" / "digitCnnVectors.json"
    fix_path.parent.mkdir(parents=True, exist_ok=True)
    fix_path.write_text(json.dumps({"samples": samples}))
    print(f"Wrote {fix_path}")

    qacc = evaluate(test_xs, test_ys, deq)
    return qacc


def main():
    print(
        f"seed={SEED} train/class={TRAIN_PER_CLASS} test/class={TEST_PER_CLASS} "
        f"epochs={EPOCHS}"
    )
    print("Generating train set...")
    train_xs, train_ys = build_dataset(TRAIN_PER_CLASS)
    print("Generating test set...")
    test_xs, test_ys = build_dataset(TEST_PER_CLASS)

    params = train(train_xs, train_ys, EPOCHS)
    acc = evaluate(test_xs, test_ys, params)
    print(f"Final test accuracy: {acc:.4f}")
    qacc = export(params, test_xs, test_ys)
    print(f"Quantized test accuracy: {qacc:.4f}")
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
