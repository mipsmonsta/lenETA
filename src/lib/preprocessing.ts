export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Binarize and upscale the region inside `rect` of the current video frame.
 * Returns a canvas sized for OCR, or null if the region is empty.
 */
export function preprocessRegion(
  video: HTMLVideoElement,
  rect: Rect,
  scale = 3,
): HTMLCanvasElement | null {
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

  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = gray
    d[i + 1] = gray
    d[i + 2] = gray
    if (gray < min) min = gray
    if (gray > max) max = gray
  }
  const threshold = min + (max - min) / 2
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > threshold ? 255 : 0
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
  }

  const tmp = document.createElement('canvas')
  tmp.width = width
  tmp.height = height
  tmp.getContext('2d')!.putImageData(img, 0, 0)

  const out = document.createElement('canvas')
  out.width = width * scale
  out.height = height * scale
  const octx = out.getContext('2d')!
  octx.imageSmoothingEnabled = false
  octx.drawImage(tmp, 0, 0, width, height, 0, 0, out.width, out.height)
  return out
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
