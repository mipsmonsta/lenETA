import { createWorker, OEM, PSM, type Worker as TesseractWorker } from 'tesseract.js'
import { simd } from 'wasm-feature-detect'
import type { Rect } from './geometry'

/**
 * Tesseract.js-based OCR for the 5-digit bus stop code.
 *
 * Replaces the old binarize → column-project → tiny-CNN pipeline: a real OCR
 * engine reads the whole text line in one pass, so we no longer need to split
 * the crop into exactly five digit columns (the old pipeline's main failure).
 *
 * The engine assets are vendored under public/models/tesseract/ and precached
 * by the service worker so scanning works fully offline (see scripts/vendor-ocr.mjs
 * and vite.config.ts).
 */

export type OcrEngine = TesseractWorker

export interface OcrReading {
  /** The exact crop pixels fed to Tesseract, scaled for recognition. */
  crop: HTMLCanvasElement
  /** Tesseract's raw recognised text for the crop. */
  text: string
  /** Tesseract page confidence, normalised to 0..1. */
  confidence: number
  /** `text` filtered to digits, or null when it is not exactly 5 digits. */
  code: string | null
}

/** Legacy core used only on devices without WebAssembly SIMD support. */
const CORE_SIMD = 'tesseract-core-simd-lstm.wasm.js'
const CORE_LEGACY = 'tesseract-core-lstm.wasm.js'

/**
 * Tesseract reads printed text best when glyphs are ~20-40px tall. The guide
 * box crop can be smaller than that on far-away poles, so upscale short crops
 * before recognition.
 */
const TARGET_CROP_HEIGHT = 96
const MAX_UPSCALE = 3

let enginePromise: Promise<OcrEngine> | null = null

function assetUrl(name: string): string {
  return `${import.meta.env.BASE_URL}models/tesseract/${name}`
}

/**
 * Lazily create (and reuse) the single Tesseract worker, configured for
 * exactly one line of digits. Resolves when the engine is fully loaded and
 * initialised (core + english traineddata), so the first `recognizeCrop`
 * call is guaranteed to succeed.
 *
 * All assets are same-origin URLs served by the Workbox precache. The
 * tesseract worker is created from this page, so its top-level script, its
 * `importScripts` of the core, and its language-data fetch are all
 * intercepted by the service worker once this page is controlled — keeping
 * the whole engine usable fully offline (verified in a headless-browser
 * test with the network disabled).
 *
 * Note: do NOT pass the core as a blob: URL. Tesseract treats a corePath
 * as a *file* only when it ends in ".js", otherwise as a directory it
 * appends the SIMD filename to — which breaks blob: URLs at importScripts.
 */
export async function initOcrEngine(
  onProgress?: (progress: number) => void,
): Promise<OcrEngine> {
  if (!enginePromise) {
    onProgress?.(0)
    enginePromise = (async () => {
      const hasSimd = await simd()
      // SIMD cores are ~2x faster; fall back to the plain LSTM core on
      // older devices that lack WebAssembly SIMD.
      const coreName = hasSimd ? CORE_SIMD : CORE_LEGACY

      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: assetUrl('worker.min.js'),
        // An explicit file (ends .js): Tesseract importScripts it directly.
        corePath: assetUrl(coreName),
        // Tesseract fetches <lang>.traineddata.gz from this directory with a
        // normal fetch() inside its (controlled) worker.
        langPath: assetUrl(''),
        gzip: true,
        workerBlobURL: false,
        logger: (m) => {
          // Map tesseract's internal phases onto a single 0..1 load progress.
          if (m.status.includes('loading tesseract core')) {
            onProgress?.(0.1 + 0.5 * m.progress)
          } else if (m.status.includes('loading language traineddata')) {
            onProgress?.(0.6 + 0.35 * m.progress)
          } else if (m.status.includes('initializing tesseract')) {
            onProgress?.(0.98)
          }
        },
      })
      await worker.setParameters({
        // Digits only — the code on SG bus poles is purely numeric.
        tessedit_char_whitelist: '0123456789',
        // The guide box hugs a single line of text.
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        preserve_interword_spaces: '0',
      })
      return worker
    })()
    enginePromise
      .then(() => onProgress?.(1))
      .catch(() => {
        enginePromise = null // allow a retry after a failed load
      })
  }
  return enginePromise
}

/** Drop the cached engine (used by tests and the retry path in useOcr). */
export function resetOcrEngine(): void {
  enginePromise = null
}

/**
 * Extract the raw video region as a canvas, upscaled when it is too short for
 * reliable LSTM recognition. Uses the *original* pixels — Tesseract does its
 * own adaptive binarisation, so passing the old morphologically-opened image
 * would only destroy information.
 */
export function cropRegion(
  video: HTMLVideoElement,
  rect: Rect,
): HTMLCanvasElement {
  const src = document.createElement('canvas')
  src.width = Math.max(1, rect.width)
  src.height = Math.max(1, rect.height)
  const sctx = src.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)

  const scale = Math.min(
    MAX_UPSCALE,
    Math.max(1, Math.ceil(TARGET_CROP_HEIGHT / Math.max(1, rect.height))),
  )
  if (scale === 1) return src

  const out = document.createElement('canvas')
  out.width = src.width * scale
  out.height = src.height * scale
  const octx = out.getContext('2d')!
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

/** Filter tesseract output down to a 5-digit code, or null. */
export function extractCode(text: string): string | null {
  const digits = (text ?? '').replace(/\D/g, '')
  return digits.length === 5 ? digits : null
}

// --- word/row-aware 5-digit candidate selection -------------------------
//
// Bus-pole frames often contain a description row below the code (road
// names, bus-service numbers …). Naively requiring the *whole crop* to
// contain exactly 5 digits discards such frames. Instead we locate the
// 5-digit *token* among the OCR words/lines and read it back on its own.

export interface OcrWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface OcrLine {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number } | null
  words: OcrWord[]
}

export interface CodeCandidate {
  code: string
  confidence: number
  bbox: OcrWord['bbox']
}

const digitsOnly = (t: string | undefined | null) => (t ?? '').replace(/\D/g, '')
const boxH = (b: OcrWord['bbox']) => b.y1 - b.y0

/** Flatten Tesseract's blocks → paragraphs → lines → words. */
export function flattenOcrLines(data: unknown): OcrLine[] {
  const blocks = (
    data as { blocks?: { paragraphs?: { lines?: OcrLine[] }[] }[] } | null
  )?.blocks
  if (!blocks) return []
  const out: OcrLine[] = []
  for (const b of blocks) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        if (!l.words?.length) continue
        const words = l.words.filter(
          (w) => w.bbox && typeof w.text === 'string',
        )
        if (!words.length) continue
        out.push(l)
      }
    }
  }
  return out
}

/**
 * Find the most plausible 5-digit stop-code token in the OCR layout.
 * Looks for single OCR words that are exactly five digits (letters around
 * the code are already suppressed by the digit whitelist). Among candidates
 * it prefers the best confidence and the tallest, most centrally-located
 * text — the code plaque is the dominant digit row, while a description row
 * below carries only short numbers (bus services, distances).
 */
export function selectCodeCandidate(
  lines: OcrLine[],
  viewport: { width: number; height: number },
): CodeCandidate | null {
  const candidates: CodeCandidate[] = []
  const add = (code: string, confidence: number, bbox: OcrWord['bbox']) => {
    if (code.length === 5 && confidence >= 0.3) {
      candidates.push({ code, confidence, bbox })
    }
  }

  for (const line of lines) {
    for (const w of line.words) {
      add(digitsOnly(w.text), w.confidence / 100, w.bbox)
    }
  }

  if (candidates.length === 0) return null
  const maxH = Math.max(...candidates.map((c) => Math.max(1, boxH(c.bbox))))
  let best: CodeCandidate | null = null
  let bestScore = -Infinity
  for (const c of candidates) {
    // Confidence dominates; taller & more central text breaks ties.
    const heightScore = 1.5 * (boxH(c.bbox) / maxH)
    const cy = (c.bbox.y0 + c.bbox.y1) / 2
    const offCentre = Math.min(1, Math.abs(cy - viewport.height / 2) / (viewport.height / 2))
    const centreScore = 0.5 * (1 - offCentre)
    const s = c.confidence * 6 + heightScore + centreScore
    if (s > bestScore) {
      bestScore = s
      best = c
    }
  }
  return best
}

async function setPsm(engine: OcrEngine, psm: PSM): Promise<void> {
  await engine.setParameters({ tessedit_pageseg_mode: psm })
}

const FAST_SINGLE_LINE_CONF = 0.9

/** Re-read just the candidate's region as a single clean line. */
async function refineCandidate(
  engine: OcrEngine,
  src: HTMLCanvasElement,
  bbox: OcrWord['bbox'],
): Promise<{ text: string; confidence: number; code: string | null } | null> {
  const pad = Math.max(2, Math.round(boxH(bbox) * 0.2))
  const sx = Math.max(0, Math.floor(bbox.x0) - pad)
  const sy = Math.max(0, Math.floor(bbox.y0) - pad)
  const sw = Math.min(src.width - sx, Math.ceil(bbox.x1 - bbox.x0) + pad * 2)
  const sh = Math.min(src.height - sy, Math.ceil(bbox.y1 - bbox.y0) + pad * 2)
  if (sw <= 0 || sh <= 0) return null

  const sub = document.createElement('canvas')
  sub.width = sw
  sub.height = sh
  const sctx = sub.getContext('2d')!
  sctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)

  // Ensure the lone digits are tall enough for the LSTM.
  const scale = Math.min(
    MAX_UPSCALE,
    Math.max(1, Math.ceil(TARGET_CROP_HEIGHT / sh)),
  )
  const out =
    scale === 1
      ? sub
      : (() => {
          const c = document.createElement('canvas')
          c.width = sw * scale
          c.height = sh * scale
          const ctx = c.getContext('2d')!
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(sub, 0, 0, c.width, c.height)
          return c
        })()

  await setPsm(engine, PSM.SINGLE_LINE)
  const res = await engine.recognize(out)
  const data = res.data
  if (typeof data.text !== 'string') return null
  return {
    text: data.text,
    confidence: (data.confidence ?? 0) / 100,
    code: extractCode(data.text),
  }
}

/**
 * Recognise the guide-box region of the current video frame.
 *
 * Two-pass pipeline for crops that also contain description text (usually a
 * separate row below the code):
 *   1. locate — block page-segmentation, then pick the 5-digit word/row
 *   2. refine — re-read just that region as one clean line
 * When the crop is a single clean line already, pass 2 is skipped.
 */
export async function recognizeRegion(
  engine: OcrEngine,
  video: HTMLVideoElement,
  rect: Rect,
): Promise<OcrReading | null> {
  if (rect.width <= 0 || rect.height <= 0 || !video.videoWidth) return null
  const crop = cropRegion(video, rect)
  if (!crop.width || !crop.height) return null

  // Pass 1 — locate rows & words (block mode keeps the code row separate
  // from a description row instead of PSM 7 fusing them into one line).
  await setPsm(engine, PSM.SINGLE_BLOCK)
  const r1 = await engine.recognize(crop, {}, { text: true, blocks: true })
  const data = r1.data as unknown
  const text1 = typeof (data as { text?: unknown }).text === 'string'
    ? ((data as { text: string }).text)
    : ''
  const pageConf = ((data as { confidence?: number }).confidence ?? 0) / 100
  const lines = flattenOcrLines(data)
  const cand = selectCodeCandidate(lines, {
    width: crop.width,
    height: crop.height,
  })

  if (!cand) {
    // Nothing usable in block mode — legacy single-line attempt.
    return { crop, text: text1, confidence: pageConf, code: extractCode(text1) }
  }

  // Fast path: a single high-confidence line needs no refinement.
  if (lines.length <= 1 && cand.confidence >= FAST_SINGLE_LINE_CONF) {
    return { crop, text: text1, confidence: cand.confidence, code: cand.code }
  }

  // Pass 2 — re-read just the candidate region as one clean line.
  const refined = await refineCandidate(engine, crop, cand.bbox)
  if (refined?.code) {
    return { crop, text: refined.text, confidence: refined.confidence, code: refined.code }
  }
  return { crop, text: text1, confidence: cand.confidence, code: cand.code }
}
