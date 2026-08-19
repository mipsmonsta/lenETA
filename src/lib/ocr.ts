import { loadModel, predict, type DigitCnnModel } from './digitcnn'
import { segmentDigits, normalizeCell } from './segment'
import type { BinaryImage } from './preprocessing'

export interface OcrResult {
  digits: string
  confidence: number
  probs: number[]
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
  return { digits: digits.join(''), confidence: conf / 5, probs }
}
