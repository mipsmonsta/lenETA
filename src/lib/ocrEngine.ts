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

/**
 * Recognise the guide-box region of the current video frame. Returns null
 * when no usable reading came back (engine not ready is the caller's job).
 */
export async function recognizeRegion(
  engine: OcrEngine,
  video: HTMLVideoElement,
  rect: Rect,
): Promise<OcrReading | null> {
  if (rect.width <= 0 || rect.height <= 0 || !video.videoWidth) return null
  const crop = cropRegion(video, rect)
  const { data } = await engine.recognize(crop)
  if (!data || typeof data.text !== 'string') return null
  return {
    crop,
    text: data.text,
    confidence: (data.confidence ?? 0) / 100,
    code: extractCode(data.text),
  }
}
