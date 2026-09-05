export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Shrink `box` around `anchor` by `1/zoom`. Used for camera zoom: the video
 * is magnified visually about the guide-box centre, so the region of the
 * *unzoomed* frame that ends up under the guide box is the box collapsed
 * onto its centre by the zoom factor. That region is what gets sent to OCR.
 */
export function zoomRectAbout(
  box: Rect,
  anchor: { x: number; y: number },
  zoom: number,
): Rect {
  const z = Math.max(1e-3, zoom)
  return {
    x: anchor.x + (box.x - anchor.x) / z,
    y: anchor.y + (box.y - anchor.y) / z,
    width: box.width / z,
    height: box.height / z,
  }
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
