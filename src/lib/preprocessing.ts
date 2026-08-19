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

/**
 * Extract the region inside `rect` of the current video frame, convert to
 * grayscale, and binarize with an adaptive (local-mean) threshold so it is
 * robust to shadows, glare and background content. The result is auto-inverted
 * so ink is always dark-on-light, then denoised with a small morphological open.
 * Returns null if the region is empty or has too little contrast.
 */
export function binarizeRegion(
  video: HTMLVideoElement,
  rect: Rect,
): BinaryImage | null {
  const { x, y, width, height } = rect
  if (width <= 0 || height <= 0) return null

  const src = document.createElement('canvas')
  src.width = width
  src.height = height
  const sctx = src.getContext('2d', { willReadFrequently: true })
  if (!sctx) return null
  sctx.drawImage(video, x, y, width, height, 0, 0, width, height)

  const img = sctx.getImageData(0, 0, width, height)
  const d = img.data
  const gray = new Uint8Array(width * height)
  let min = 255
  let max = 0
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    gray[p] = g
    if (g < min) min = g
    if (g > max) max = g
  }
  if (max - min < 24) return null

  let bin = adaptiveThreshold(gray, width, height)

  let ink = 0
  for (let i = 0; i < bin.length; i++) ink += bin[i]
  if (ink < 6) return null
  if (ink > width * height / 2) {
    bin = invert(bin)
  }

  bin = morphOpen(bin, width, height)
  return { data: bin, width, height }
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

/** 3x3 morphological open (erode then dilate) to remove isolated specks. */
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
