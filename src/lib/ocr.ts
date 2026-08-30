import { loadModel, predict, type DigitCnnModel } from './digitcnn'
import {
  segmentDigits,
  selectTextBand,
  normalizeCell,
  type Segment,
} from './segment'
import type { BinaryImage } from './preprocessing'

export interface OcrResult {
  digits: string
  confidence: number
  probs: number[]
  /** Bounding boxes of each segmented digit in crop coordinates. */
  boxes: Segment[]
}

export interface OcrDiagnostic {
  /** Number of digit columns found before/after heuristics, or null if unusable. */
  segmentCount: number | null
  /**
   * Why no usable digit string came out. Stages in order the pipeline checks:
   * - 'low-contrast' | 'no-ink'   binarization rejected the crop
   * - 'no-band'                   binarized but no horizontal text row found
   * - 'seg-not-5'                 band found but not exactly 5 columns
   * - 'empty-cell'                a digit cell normalized to no ink
   * - null                        segmentation OK (classification handled later)
   */
  failReason?:
    | 'low-contrast'
    | 'no-ink'
    | 'no-band'
    | 'seg-not-5'
    | 'empty-cell'
    | null
}

let modelPromise: Promise<DigitCnnModel> | null = null

export function initOcr(
  onProgress?: (progress: number) => void,
): Promise<DigitCnnModel> {
  if (!modelPromise) {
    onProgress?.(0)
    modelPromise = loadModel()
    modelPromise.then(() => onProgress?.(1)).catch(() => {})
  }
  return modelPromise
}

/**
 * Segment a binarized crop into digit cells, classify each with the CNN, and
 * return the 5-digit code with its mean confidence. Returns null when the
 * frame cannot be segmented into exactly five cells.
 */
export function recognizeDigits(
  model: DigitCnnModel,
  bin: BinaryImage,
): OcrResult | null {
  const segs = segmentDigits(bin)
  if (!segs || segs.length !== 5) return null

  const digits: number[] = []
  const probs: number[] = []
  let conf = 0
  for (const s of segs) {
    const cell = normalizeCell(bin, s.x, s.y, s.width, s.height)
    if (!cell) return null
    const p = predict(model, cell)
    let best = 0
    for (let i = 1; i < p.length; i++) {
      if (p[i] > p[best]) best = i
    }
    digits.push(best)
    probs.push(p[best])
    conf += p[best]
  }
  return { digits: digits.join(''), confidence: conf / 5, probs, boxes: segs }
}

/**
 * Debug-only variant of segmentDigits that returns diagnostics instead of
 * returning null. Used by the dev diagnostics panel to show *why* the frame
 * did not produce exactly five usable digits, and the raw column projection.
 */
export function segmentDigitsDiagnostic(
  bin: BinaryImage,
): {
  segs: Segment[] | null
  band: { y0: number; y1: number } | null
  rawSegments: number
  segmentCount: number | null
  failReason: OcrDiagnostic['failReason']
} {
  const band = selectTextBand(bin)
  if (!band) {
    return {
      segs: null,
      band: null,
      rawSegments: 0,
      segmentCount: null,
      failReason: 'no-band',
    }
  }
  const rawSegments = countRawSegments(bin, band)
  const segs = segmentDigits(bin)
  const segmentCount = segs ? segs.length : null
  if (!segs) {
    return {
      segs: null,
      band,
      rawSegments,
      segmentCount,
      failReason: 'seg-not-5',
    }
  }
  return { segs, band, rawSegments, segmentCount, failReason: null }
}

function countRawSegments(bin: BinaryImage, band: { y0: number; y1: number }): number {
  const cols = new Int32Array(bin.width)
  for (let y = band.y0; y < band.y1; y++) {
    for (let x = 0; x < bin.width; x++) {
      if (bin.data[y * bin.width + x]) cols[x]++
    }
  }
  let start = -1
  let n = 0
  for (let x = 0; x < bin.width; x++) {
    if (cols[x] > 0) {
      if (start < 0) start = x
    } else if (start >= 0) {
      n++
      start = -1
    }
  }
  if (start >= 0) n++
  return n
}
