import { useEffect, useRef } from 'react'
import { initOcr, recognizeDigits } from '../lib/ocr'
import {
  binarizeRegion,
  binToCanvas,
  type Rect,
} from '../lib/preprocessing'

export interface ScanStatus {
  reading: string
  confidence: number
  loading: boolean
  progress: number
  preview?: HTMLCanvasElement | null
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

      const bin = binarizeRegion(video, opts.guide)
      if (!bin) {
        emit({ reading: 'No code detected', confidence: 0, loading: false, progress: 1 })
        timer = window.setTimeout(tick, 400)
        return
      }

      try {
        const model = await initOcr()
        const result = recognizeDigits(model, bin)
        if (cancelled) return

        let reading = 'No code detected'
        let confidence = 0
        let match = false

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
          preview: import.meta.env.DEV ? binToCanvas(bin) : undefined,
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
