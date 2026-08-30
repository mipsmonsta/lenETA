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

  let bin = adaptiveThreshold(gray, width, height)
  let ink = countInk(bin)

  if (ink < 6) {
    // Adaptive threshold failed (low contrast): fall back to a global
    // threshold so thin/dim real digits are still picked up.
    const th = sum / gray.length
    bin = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bin[i] = gray[i] < th * 0.92 ? 1 : 0
    ink = countInk(bin)
  }
  if (ink < 6) return { bin: null, reason: 'no-ink' }
  if (ink > width * height / 2) bin = invert(bin)

  // Use a gentler open (single erode+dilate of thin structures) so that
  // real digit strokes aren't wiped out entirely. Only erode away isolated
  // specks while preserving connected text.
  bin = morphOpen(bin, width, height)
  return { bin: { data: bin, width, height }, reason: null }
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
 * Gentle morphological open (erode with a 4-neighbourhood cross, then dilate
 * with a 3x3). The cross erosion only removes isolated specks — pixels whose
 * horizontal AND vertical neighbours are all empty — while a 3x3 erosion would
 * have wiped out thin real-world digit strokes entirely. Widening this back to
 * a 3x3-open was a silent cause of "no-band" on real bus-stop text.
 */
function morphOpen(bin: Uint8Array, w: number, h: number): Uint8Array {
  const eroded = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      // Keep a pixel only if it has an inked horizontal and vertical
      // neighbour (i.e. is not an isolated speck). Thin strokes survive.
      if (
        bin[i] &&
        ((bin[i - 1] && bin[i + 1]) || // horizontal line
          (bin[i - w] && bin[i + w]))   // vertical line
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
