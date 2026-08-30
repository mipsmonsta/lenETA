import type { BinaryImage } from './preprocessing'

export interface Segment {
  x: number
  y: number
  width: number
  height: number
}

interface ColSeg {
  x0: number
  x1: number
  ink: number
}

/**
 * Pick the densest horizontal band of ink — the row range most likely to be
 * the stop-code text line. Rows with gaps of <= 2 empty rows belong to the
 * same band.
 */
export function selectTextBand(bin: BinaryImage): { y0: number; y1: number } | null {
  const h = bin.height
  const rows = new Uint32Array(h)
  let any = false
  for (let y = 0; y < h; y++) {
    let c = 0
    for (let x = 0; x < bin.width; x++) c += bin.data[y * bin.width + x]
    rows[y] = c
    if (c > 0) any = true
  }
  if (!any) return null

  const bands: { y0: number; y1: number; ink: number }[] = []
  let start = -1
  let last = -1
  let ink = 0
  for (let y = 0; y < h; y++) {
    if (rows[y] > 0) {
      if (start < 0) {
        start = y
        ink = 0
      } else if (y - last > 2) {
        bands.push({ y0: start, y1: last + 1, ink })
        start = y
        ink = 0
      }
      last = y
      ink += rows[y]
    }
  }
  if (start >= 0) bands.push({ y0: start, y1: last + 1, ink })

  // A real 5-digit row has meaningful vertical extent. Reject single/very
  // thin noise bands (these were capturing faint 1px horizontal lines and
  // feeding empty/blank cells to the CNN). Sort by ink, then pick the first
  // band that is at least ~9% of crop height (>=5px). If none qualify, fall
  // back to the TALLEST band (a better shape prior than a thin dense line).
  const minH = Math.max(5, Math.round(h * 0.09))
  bands.sort((a, b) => b.ink - a.ink)
  let best = bands.find((b) => b.y1 - b.y0 >= minH)
  if (!best) {
    best = bands.slice().sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0))[0]
  }
  return best ? { y0: best.y0, y1: best.y1 } : null
}

/**
 * Split the text band into digit columns via projection (gaps between digits
 * show up as empty columns). Applies heuristics to converge on exactly five
 * cells and returns their bounding boxes, or null if the frame is unusable.
 */
export function segmentDigits(bin: BinaryImage): Segment[] | null {
  const band = selectTextBand(bin)
  if (!band) return null

  const cols = new Int32Array(bin.width)
  let inkTotal = 0
  for (let y = band.y0; y < band.y1; y++) {
    for (let x = 0; x < bin.width; x++) {
      if (bin.data[y * bin.width + x]) {
        cols[x]++
        inkTotal++
      }
    }
  }
  if (inkTotal < 20) return null

  const segs: ColSeg[] = []
  let start = -1
  for (let x = 0; x < bin.width; x++) {
    if (cols[x] > 0) {
      if (start < 0) start = x
    } else if (start >= 0) {
      segs.push({ x0: start, x1: x - 1, ink: 0 })
      start = -1
    }
  }
  if (start >= 0) segs.push({ x0: start, x1: bin.width - 1, ink: 0 })
  for (const s of segs) {
    for (let x = s.x0; x <= s.x1; x++) s.ink += cols[x]
  }

  let kept = segs.filter((s) => s.x1 - s.x0 + 1 >= 2 && s.ink >= 3)
  kept = mergeSmallGaps(kept)

  if (kept.length > 5) {
    kept = kept
      .sort((a, b) => b.ink - a.ink)
      .slice(0, 5)
      .sort((a, b) => a.x0 - b.x0)
  }

  let guard = 0
  while (kept.length < 5 && guard++ < 20) {
    kept.sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0))
    const s = kept[0]
    if (s.x1 - s.x0 + 1 < 3) break
    let bestX = -1
    let bestV = Infinity
    for (let x = s.x0 + 1; x <= s.x1 - 1; x++) {
      if (cols[x] < bestV) {
        bestV = cols[x]
        bestX = x
      }
    }
    if (bestX < 0 || bestV >= Math.max(cols[s.x0], cols[s.x1])) break
    kept = kept.filter((k) => k !== s)
    kept.push(
      { x0: s.x0, x1: bestX - 1, ink: 0 },
      { x0: bestX + 1, x1: s.x1, ink: 0 },
    )
    kept.sort((a, b) => a.x0 - b.x0)
  }

  if (kept.length !== 5) return null
  return kept.map((s) => ({
    x: s.x0,
    y: band.y0,
    width: s.x1 - s.x0 + 1,
    height: band.y1 - band.y0,
  }))
}

function mergeSmallGaps(segs: ColSeg[]): ColSeg[] {
  if (segs.length < 2) return segs
  const out: ColSeg[] = [segs[0]]
  for (let i = 1; i < segs.length; i++) {
    const prev = out[out.length - 1]
    if (segs[i].x0 - prev.x1 <= 2) {
      prev.x1 = segs[i].x1
      prev.ink += segs[i].ink
    } else {
      out.push(segs[i])
    }
  }
  return out
}

/**
 * Normalize a digit cell into a centered 28x28 image (1 = ink). The bbox is
 * padded to a square, bilinear-resized to 20x20, then centered with a 4px
 * margin. Must stay numerically in sync with scripts/train_digit_cnn.py.
 */
export function normalizeCell(
  bin: BinaryImage,
  x: number,
  y: number,
  w: number,
  h: number,
): Float32Array | null {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let yy = 0; yy < h; yy++) {
    const row = (y + yy) * bin.width
    for (let xx = 0; xx < w; xx++) {
      if (bin.data[row + x + xx] > 0) {
        if (xx < minX) minX = xx
        if (xx > maxX) maxX = xx
        if (yy < minY) minY = yy
        if (yy > maxY) maxY = yy
      }
    }
  }
  if (maxX < 0) return null

  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const side = Math.max(cw, ch) + 4
  const sx0 = x + minX - 2
  const sy0 = y + minY - 2

  const src = new Float32Array(side * side)
  for (let yy = 0; yy < side; yy++) {
    const gy = sy0 + yy
    for (let xx = 0; xx < side; xx++) {
      const gx = sx0 + xx
      src[yy * side + xx] =
        gx >= 0 && gy >= 0 && gx < bin.width && gy < bin.height
          ? bin.data[gy * bin.width + gx]
          : 0
    }
  }

  const inner = 20
  const size = 28
  const resized = bilinearResize(src, side, side, inner, inner)
  const out = new Float32Array(size * size)
  const m = (size - inner) >> 1
  for (let yy = 0; yy < inner; yy++) {
    for (let xx = 0; xx < inner; xx++) {
      out[(yy + m) * size + (xx + m)] = resized[yy * inner + xx]
    }
  }
  return out
}

function bilinearResize(
  src: Float32Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float32Array {
  const out = new Float32Array(dw * dh)
  for (let y = 0; y < dh; y++) {
    const sy = ((y + 0.5) * sh) / dh - 0.5
    const y0 = Math.floor(sy)
    const fy = sy - y0
    for (let x = 0; x < dw; x++) {
      const sx = ((x + 0.5) * sw) / dw - 0.5
      const x0 = Math.floor(sx)
      const fx = sx - x0
      let v = 0
      for (let dy = 0; dy < 2; dy++) {
        const yy = Math.min(sh - 1, Math.max(0, y0 + dy))
        for (let dx = 0; dx < 2; dx++) {
          const xx = Math.min(sw - 1, Math.max(0, x0 + dx))
          const wgt = (dx === 0 ? 1 - fx : fx) * (dy === 0 ? 1 - fy : fy)
          v += src[yy * sw + xx] * wgt
        }
      }
      out[y * dw + x] = v
    }
  }
  return out
}
