import { useEffect, useRef } from 'react'
import { initOcr, recognizeDigits } from '../lib/ocr'
import { preprocessRegion, type Rect } from '../lib/preprocessing'

export interface ScanStatus {
  reading: string
  confidence: number
  loading: boolean
  progress: number
}

export function useOcr(opts: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  enabled: boolean
  guide: Rect | null
  onDetected: (code: string) => void
  onStatus?: (status: ScanStatus) => void
  validate?: (code: string) => boolean
  scale?: number
}) {
  const onDetectedRef = useRef(opts.onDetected)
  onDetectedRef.current = opts.onDetected
  const onStatusRef = useRef(opts.onStatus)
  onStatusRef.current = opts.onStatus
  const validateRef = useRef(opts.validate)
  validateRef.current = opts.validate
  const scaleRef = useRef(opts.scale)
  scaleRef.current = opts.scale

  useEffect(() => {
    if (!opts.enabled || !opts.guide) return

    let cancelled = false
    let timer: number | undefined
    let workerReady = false
    let last = ''

    const tick = async () => {
      if (cancelled) return
      const video = opts.videoRef.current
      if (!video || video.readyState < 2 || !video.videoWidth || !opts.guide) {
        timer = window.setTimeout(tick, 500)
        return
      }
      if (!workerReady) {
        onStatusRef.current?.({
          reading: '',
          confidence: 0,
          loading: true,
          progress: 0,
        })
        try {
          await initOcr((p) => {
            if (!cancelled) {
              onStatusRef.current?.({
                reading: '',
                confidence: 0,
                loading: true,
                progress: p,
              })
            }
          })
          workerReady = true
        } catch {
          onStatusRef.current?.({
            reading: 'OCR failed to load',
            confidence: 0,
            loading: false,
            progress: 0,
          })
          timer = window.setTimeout(tick, 3000)
          return
        }
      }

      const canvas = preprocessRegion(video, opts.guide, scaleRef.current ?? 2)
      if (canvas) {
        try {
          const { digits, confidence } = await recognizeDigits(canvas)
          if (cancelled) return
          onStatusRef.current?.({
            reading: digits || 'No code detected',
            confidence,
            loading: false,
            progress: 1,
          })
          if (/^\d{5}$/.test(digits)) {
            if (validateRef.current?.(digits)) {
              onDetectedRef.current(digits)
              return
            }
            if (digits === last) {
              onDetectedRef.current(digits)
              return
            }
            last = digits
          } else {
            last = ''
          }
        } catch {
          // ignore a bad frame and keep scanning
        }
      }
      timer = window.setTimeout(tick, 350)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [opts.enabled, opts.guide, opts.videoRef])
}
