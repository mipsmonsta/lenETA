import { useEffect, useRef } from 'react'
import {
  initOcr,
  recognizeDigits,
  segmentDigitsDiagnostic,
  type OcrDiagnostic,
} from '../lib/ocr'
import {
  binarizeRegionWithReason,
  binToCanvas,
  type Rect,
  type BinaryImage,
  type BinarizeFail,
} from '../lib/preprocessing'
import type { Segment } from '../lib/segment'
import { ENABLE_OCR_DEBUG } from '../lib/debug'

export interface ScanStatus {
  reading: string
  confidence: number
  loading: boolean
  progress: number
  /** DEV-only: binarized preview canvas. */
  preview?: HTMLCanvasElement | null
  /** DEV-only: boxes of the 5 segmented digits in crop coordinates. */
  boxes?: Segment[] | null
  /** DEV-only: diagnosis of the current frame. */
  diagnostic?: OcrDiagnostic
  /** DEV-only: per-digit classifier confidence (0..1). */
  perDigitConf?: number[]
  /**
   * DEV-only: the normalized 28x28 input cells the CNN receives for each of
   * the 5 digits (0..255 ink), row-major. Lets us see if a misread is a
   * preprocessing problem (blobs) or a genuine classifier gap.
   */
  cells?: number[][] | null
}

/**
 * DEV-only: holds the latest frame data ref for the debug panel / save button.
 * Populated every OCR tick when diagnostics are enabled.
 */
export interface OcrDebugHandle {
  /** Latest binarized crop, or null when no usable frame yet. */
  bin: BinaryImage | null
  /** Boxes (crop coords) of the 5 digits, or null. */
  boxes: Segment[] | null
}

export const DEBUG_REFS: { current: OcrDebugHandle } = {
  current: { bin: null, boxes: null },
}

const VOTE_WINDOW = 4
const VOTE_NEEDED = 2
const CONFIDENCE_GATE = 0.75

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
    let modelReady = false
    const recent: string[] = []

    const emit = (status: ScanStatus) => {
      if (!cancelled) onStatusRef.current?.(status)
    }

    const tick = async () => {
      if (cancelled) return
      const video = opts.videoRef.current
      if (!video || video.readyState < 2 || !video.videoWidth || !opts.guide) {
        timer = window.setTimeout(tick, 500)
        return
      }

      if (!modelReady) {
        emit({ reading: '', confidence: 0, loading: true, progress: 0 })
        try {
          await initOcr((p) => {
            emit({ reading: '', confidence: 0, loading: true, progress: p })
          })
          modelReady = true
        } catch {
          emit({
            reading: 'OCR failed to load — retrying…',
            confidence: 0,
            loading: false,
            progress: 0,
          })
          timer = window.setTimeout(tick, 3000)
          return
        }
      }

      const { diagnostic, boxes, bin2 } = runDiagnostic(video, opts.guide)
      const bin = bin2
      if (!bin) {
        emit({
          reading: 'No code detected',
          confidence: 0,
          loading: false,
          progress: 1,
          boxes: null,
          diagnostic: {
            segmentCount: null,
            failReason: diagnostic?.failReason ?? 'no-band',
          },
        })
        timer = window.setTimeout(tick, 400)
        return
      }
      DEBUG_REFS.current = { bin, boxes }

      try {
        const model = await initOcr()
        const result = recognizeDigits(model, bin)
        if (cancelled) return

        let reading = 'No code detected'
        let confidence = 0
        let match = false
        const perDigitConf: number[] = result?.probs ?? []
        const cells: number[][] | null = result?.cells ?? null

        if (result) {
          reading = result.digits
          confidence = result.confidence
          if (
            /^\d{5}$/.test(result.digits) &&
            result.confidence >= CONFIDENCE_GATE
          ) {
            if (validateRef.current?.(result.digits)) {
              onDetectedRef.current(result.digits)
              return
            }
            recent.push(result.digits)
            if (recent.length > VOTE_WINDOW) recent.shift()
            const count = recent.reduce(
              (n, d) => (d === result.digits ? n + 1 : n),
              0,
            )
            match = count >= VOTE_NEEDED
          }
        }

        emit({
          reading,
          confidence,
          loading: false,
          progress: 1,
          preview: ENABLE_OCR_DEBUG ? binToCanvas(bin) : undefined,
          boxes,
          diagnostic,
          perDigitConf,
          cells,
        })

        if (match) {
          const code = recent[recent.length - 1]
          onDetectedRef.current(code)
          return
        }
      } catch {
        emit({
          reading: 'OCR error — retrying…',
          confidence: 0,
          loading: false,
          progress: 0,
        })
      }
      timer = window.setTimeout(tick, 400)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [opts.enabled, opts.guide, opts.videoRef])
}

/**
 * Binarize the guide-box region and, when the frame is usable, run
 * segmentation diagnostics. Returns the binary crop (for the CNN/debug
 * preview), the final 5 digit boxes, and the diagnostic summary. This exists
 * so the debug panel can explain a null recognition even when binarization
 * passed but column-projection segmentation did not.
 */
/** Map a binarize failure to the shared diagnostic label. */
function binarizeFailLabel(reason: BinarizeFail): OcrDiagnostic['failReason'] {
  switch (reason) {
    case 'low-contrast':
      return 'low-contrast'
    case 'no-ink':
      return 'no-ink'
    default:
      return 'no-band'
  }
}

/**
 * Binarize the guide-box region and, when the frame is usable, run
 * segmentation diagnostics. Returns the binary crop (for the CNN/debug
 * preview), the final 5 digit boxes, and the diagnostic summary, including a
 * real failure label for each stage (binarize -> band -> segment).
 */
function runDiagnostic(
  video: HTMLVideoElement,
  guide: Rect,
): {
  bin2: BinaryImage | null
  boxes: Segment[] | null
  diagnostic: OcrDiagnostic
} {
  const { bin, reason } = binarizeRegionWithReason(video, guide)
  if (!bin) {
    return {
      bin2: null,
      boxes: null,
      diagnostic: { segmentCount: null, failReason: binarizeFailLabel(reason) },
    }
  }
  const diag = segmentDigitsDiagnostic(bin)
  return {
    bin2: bin,
    boxes: diag.segs,
    diagnostic: { segmentCount: diag.segmentCount, failReason: diag.failReason },
  }
}
