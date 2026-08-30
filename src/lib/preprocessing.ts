export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Binarized image: 1 = ink (dark), 0 = background (light). */
export interface BinaryImage {
  data: Uint8Array
  width: number
  height: number
}

/** Why binarization produced no usable crop (dev diagnostics). */
export type BinarizeFail =
  | 'empty-rect'
  | 'no-canvas'
  | 'low-contrast'
  | 'no-ink'
  | null

/**
 * Extract the region inside `rect` of the current video frame, binarize it,
 * and report the success/failure. Wrapper of `binarizeRegionWithReason`.
 */
export function binarizeRegion(
  video: HTMLVideoElement,
  rect: Rect,
): BinaryImage | null {
  return binarizeRegionWithReason(video, rect).bin
}

/**
 * Binarize the guide-box crop and say *why* it failed when it did, so the dev
 * diagnostics can tell low-contrast captures apart from genuinely empty ones.
 *
 * Contrast gate is intentionally loose; when the adaptive threshold yields
 * almost no ink we fall back to a simple global (Otsu-ish) threshold so thin
 * or low-contrast real-world digits still survive. Returns null only when the
 * crop itself is unreadable.
 */
export function binarizeRegionWithReason(
  video: HTMLVideoElement,
  rect: Rect,
): { bin: BinaryImage | null; reason: BinarizeFail } {
  const { x, y, width, height } = rect
  if (width <= 0 || height <= 0) return { bin: null, reason: 'empty-rect' }

  const src = document.createElement('canvas')
  src.width = width
  src.height = height
  const sctx = src.getContext('2d', { willReadFrequently: true })
  if (!sctx) return { bin: null, reason: 'no-canvas' }
  sctx.drawImage(video, x, y, width, height, 0, 0, width, height)

  const img = sctx.getImageData(0, 0, width, height)
  const d = img.data
  const gray = new Uint8Array(width * height)
  let min = 255
  let max = 0
  let sum = 0
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    gray[p] = g
    if (g < min) min = g
    if (g > max) max = g
    sum += g
  }
  // Very permissive, but still reject a truly uniform/unreadable crop.
  if (max - min < 12) return { bin: null, reason: 'low-contrast' }

  // Otsu's global threshold splits a bimodal crop (ink vs background) into
  // two clean classes. For a fairly uniform plaque this is more stable than
  // the local adaptive threshold, which fragments thin digit bridges under
  // camera noise. Ink is the DARKER class, unless the dark class is the large
  // majority (i.e. we have light-on-dark signage) in which case we invert so
  // ink always means the minority foreground strokes.
  const th = otsuThreshold(gray, width * height)
  let bin: Uint8Array = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] <= th ? 1 : 0
  let ink = countInk(bin)

  if (ink < 6 || ink > gray.length / 2) {
    // Fall back to / correct with the adaptive threshold for low-contrast or
    // skewed captures; then always force the minority class to be ink.
    let ad = adaptiveThreshold(gray, width, height)
    let adInk = countInk(ad)
    if (adInk > gray.length / 2) ad = invert(ad)
    bin = ad
    ink = countInk(bin)
    if (ink < 6) {
      const mean = sum / gray.length
      bin = new Uint8Array(gray.length)
      for (let i = 0; i < gray.length; i++) bin[i] = gray[i] < mean * 0.92 ? 1 : 0
      ink = countInk(bin)
      if (ink > gray.length / 2) bin = invert(bin)
    }
  }
  if (countInk(bin) < 6) return { bin: null, reason: 'no-ink' }

  // Denoise with a morphological open. Use a full 3x3 open first so solid,
  // merged digit blobs get separated/hollowed back towards outlines. If that
  // would wipe out the text entirely (thin real strokes), fall back to the
  // unopened bin so we never silently erase a usable row.
  const opened = morphOpen(bin, width, height)
  bin = countInk(opened) > 0 ? opened : bin
  return { bin: { data: bin, width, height }, reason: null }
}

/** Otsu's method: threshold that maximizes inter-class variance. */
export function otsuThreshold(gray: Uint8Array, n: number): number {
  const hist = new Float64Array(256)
  for (let i = 0; i < n; i++) hist[gray[i]]++
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let maxVar = -1
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = n - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const varBetween = wB * wF * (mB - mF) * (mB - mF)
    if (varBetween > maxVar) {
      maxVar = varBetween
      threshold = t
    }
  }
  return threshold
}

function countInk(bin: Uint8Array): number {
  let n = 0
  for (let i = 0; i < bin.length; i++) n += bin[i]
  return n
}

/**
 * Bradley / Wellner adaptive threshold. A pixel is ink when it is darker than
 * `factor` times the mean of its surrounding window.
 */
function adaptiveThreshold(gray: Uint8Array, w: number, h: number): Uint8Array {
  const s = Math.max(2, Math.round(Math.min(w, h) / 8))
  const s2 = s / 2
  const factor = 0.85
  const intImg = new Float32Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x]
      intImg[(y + 1) * (w + 1) + (x + 1)] = intImg[y * (w + 1) + (x + 1)] + rowSum
    }
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - s2)
    const y2 = Math.min(h - 1, y + s2)
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - s2)
      const x2 = Math.min(w - 1, x + s2)
      const area = (x2 - x1 + 1) * (y2 - y1 + 1)
      const sum =
        intImg[(y2 + 1) * (w + 1) + (x2 + 1)] -
        intImg[y1 * (w + 1) + (x2 + 1)] -
        intImg[(y2 + 1) * (w + 1) + x1] +
        intImg[y1 * (w + 1) + x1]
      const mean = sum / area
      out[y * w + x] = gray[y * w + x] < mean * factor ? 1 : 0
    }
  }
  return out
}

function invert(bin: Uint8Array): Uint8Array {
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin[i] ? 0 : 1
  return out
}

/**
 * 3x3 morphological open (erode then dilate). Erosion removes isolated
 * specks and thins/hollows solid merged digit blobs back towards outlines;
 * dilation restores the remaining connected strokes. Callers guard against
 * total erasure (empty result) so thin text is never lost.
 */
function morphOpen(bin: Uint8Array, w: number, h: number): Uint8Array {
  const eroded = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (
        bin[i - w - 1] && bin[i - w] && bin[i - w + 1] &&
        bin[i - 1] && bin[i] && bin[i + 1] &&
        bin[i + w - 1] && bin[i + w] && bin[i + w + 1]
      ) {
        eroded[i] = 1
      }
    }
  }
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (
        eroded[i - w - 1] || eroded[i - w] || eroded[i - w + 1] ||
        eroded[i - 1] || eroded[i] || eroded[i + 1] ||
        eroded[i + w - 1] || eroded[i + w] || eroded[i + w + 1]
      ) {
        out[i] = 1
      }
    }
  }
  return out
}

/** Render a BinaryImage to a canvas (used by the dev-only preview). */
export function binToCanvas(bin: BinaryImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = bin.width
  canvas.height = bin.height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(bin.width, bin.height)
  for (let i = 0, p = 0; i < bin.data.length; i++, p += 4) {
    const v = bin.data[i] ? 0 : 255
    img.data[p] = v
    img.data[p + 1] = v
    img.data[p + 2] = v
    img.data[p + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/**
 * Map a box defined in the on-screen (container) coordinate space to the
 * full-resolution video frame, accounting for object-fit: cover scaling.
 */
export function containerBoxToVideoRect(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  box: Rect,
): Rect {
  const scale = Math.max(
    containerWidth / videoWidth,
    containerHeight / videoHeight,
  )
  const dw = videoWidth * scale
  const dh = videoHeight * scale
  const ox = (containerWidth - dw) / 2
  const oy = (containerHeight - dh) / 2
  const toVideo = (px: number, py: number) => ({
    x: (px - ox) / scale,
    y: (py - oy) / scale,
  })
  const a = toVideo(box.x, box.y)
  const b = toVideo(box.x + box.width, box.y + box.height)
  const rx = Math.max(0, a.x)
  const ry = Math.max(0, a.y)
  return {
    x: rx,
    y: ry,
    width: Math.min(videoWidth, b.x) - rx,
    height: Math.min(videoHeight, b.y) - ry,
  }
}
