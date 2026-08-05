import { createWorker, PSM, type Worker } from 'tesseract.js'

const FAST_LANG_PATH = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0'

let workerPromise: Promise<Worker> | null = null

export function initOcr(onProgress?: (progress: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(m.progress)
        }
      },
      langPath: FAST_LANG_PATH,
      cacheMethod: 'indexeddb',
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
      })
      return worker
    })
  }
  return workerPromise
}

export interface OcrResult {
  digits: string
  confidence: number
}

export async function recognizeDigits(
  canvas: HTMLCanvasElement,
): Promise<OcrResult> {
  const worker = await initOcr()
  const { data } = await worker.recognize(canvas)
  const digits = (data.text ?? '').replace(/[^\d]/g, '')
  return { digits, confidence: data.confidence }
}
