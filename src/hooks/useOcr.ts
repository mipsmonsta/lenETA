import { useEffect, useRef } from 'react'
import {
  initOcrEngine,
  recognizeRegion,
  resetOcrEngine,
  type OcrEngine,
} from '../lib/ocrEngine'
import type { Rect } from '../lib/geometry'
import { ENABLE_OCR_DEBUG } from '../lib/debug'

export interface ScanStatus {
  reading: string
  confidence: number
  loading: boolean
  progress: number
  /**
   * DEV-only: the exact raw crop pixels that were fed to the OCR engine
   * (already scaled for recognition).
   */
  preview?: HTMLCanvasElement | null
  /** DEV-only: Tesseract's raw output text before digit filtering. */
  rawText?: string
  /** DEV-only: whether the last frame produced exactly 5 digits. */
  recognized?: boolean
}

/**
 * DEV-only: holds the latest frame data for the debug panel / save button.
 * Populated every OCR tick when diagnostics are enabled.
 */
export interface OcrDebugHandle {
  /** Raw crop fed to OCR, or null when no usable frame yet. */
  crop: HTMLCanvasElement | null
  rawText: string
  code: string | null
  confidence: number
}

export const DEBUG_REFS: { current: OcrDebugHandle } = {
  current: { crop: null, rawText: '', code: null, confidence: 0 },
}

const VOTE_WINDOW = 4
const VOTE_NEEDED = 2
/**
 * Tesseract page confidence (0..1) gate. Real printed digits score very high
 * (~0.9+); blurry/misread frames drop well below. Tune with real captured
 * frames (see README: Debugging OCR).
 */
const CONFIDENCE_GATE = 0.65

const FRAME_INTERVAL_MS = 350

export function useOcr(opts: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  enabled: boolean
  guide: Rect | null
  onDetected: (code: string) => void
  onStatus?: (status: ScanStatus) => void
  validate?: (code: string) => boolean
}) {
  const onDetectedRef = useRef(opts.onDetected)
  onDetectedRef.current = opts.onDetected
  const onStatusRef = useRef(opts.onStatus)
  onStatusRef.current = opts.onStatus
  const validateRef = useRef(opts.validate)
  validateRef.current = opts.validate

  useEffect(() => {
    if (!opts.enabled || !opts.guide) return

    let cancelled = false
    let timer: number | undefined
    let engine: OcrEngine | null = null
    const recent: string[] = []

    const emit = (status: ScanStatus) => {
      if (!cancelled) onStatusRef.current?.(status)
    }

    const ensureEngine = async (): Promise<OcrEngine | null> => {
      if (engine) return engine
      emit({ reading: '', confidence: 0, loading: true, progress: 0 })
      try {
        engine = await initOcrEngine((progress) => {
          emit({ reading: '', confidence: 0, loading: true, progress })
        })
        return engine
      } catch {
        resetOcrEngine()
        emit({
          reading: 'OCR engine failed to load — retrying…',
          confidence: 0,
          loading: false,
          progress: 0,
        })
        return null
      }
    }

    const tick = async () => {
      if (cancelled) return
      const video = opts.videoRef.current
      const guide = opts.guide
      if (!video || video.readyState < 2 || !video.videoWidth || !guide) {
        timer = window.setTimeout(tick, 500)
        return
      }

      const eng = await ensureEngine()
      if (cancelled || !eng) {
        timer = window.setTimeout(tick, eng ? FRAME_INTERVAL_MS : 3000)
        return
      }

      try {
        const reading = await recognizeRegion(eng, video, guide)
        if (cancelled) return

        let readingLabel = 'No code detected'
        let confidence = 0
        let recognized = false
        const rawText = reading?.text ?? ''
        const preview = reading?.crop ?? null

        if (reading?.code) {
          readingLabel = reading.code
          confidence = reading.confidence
          recognized = true

          if (reading.confidence >= CONFIDENCE_GATE) {
            if (validateRef.current?.(reading.code)) {
              onDetectedRef.current(reading.code)
              return
            }
            recent.push(reading.code)
            if (recent.length > VOTE_WINDOW) recent.shift()
            const count = recent.reduce(
              (n, d) => (d === reading.code ? n + 1 : n),
              0,
            )
            if (count >= VOTE_NEEDED) {
              onDetectedRef.current(reading.code)
              return
            }
          }
        }

        if (ENABLE_OCR_DEBUG) {
          DEBUG_REFS.current = {
            crop: preview,
            rawText,
            code: reading?.code ?? null,
            confidence,
          }
        }

        emit({
          reading: readingLabel,
          confidence,
          loading: false,
          progress: 1,
          preview: ENABLE_OCR_DEBUG ? preview : undefined,
          rawText: ENABLE_OCR_DEBUG ? rawText : undefined,
          recognized: ENABLE_OCR_DEBUG ? recognized : undefined,
        })
      } catch {
        emit({
          reading: 'OCR error — retrying…',
          confidence: 0,
          loading: false,
          progress: 0,
        })
      }
      timer = window.setTimeout(tick, FRAME_INTERVAL_MS)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      // The engine worker is process-wide and reused across mounts; do not
      // terminate it here — re-entering the scan screen would pay the full
      // core + language load again.
    }
  }, [opts.enabled, opts.guide, opts.videoRef])
}
