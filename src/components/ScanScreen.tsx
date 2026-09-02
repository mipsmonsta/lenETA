import { useEffect, useMemo, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useOcr, DEBUG_REFS, type ScanStatus } from '../hooks/useOcr'
import { containerBoxToVideoRect, type Rect } from '../lib/geometry'
import { loadStops } from '../lib/stops'
import { ENABLE_OCR_DEBUG } from '../lib/debug'
import type { Stop } from '../types'

export default function ScanScreen({
  onDetected,
  onManual,
  onClose,
}: {
  onDetected: (code: string) => void
  onManual: () => void
  onClose: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const { videoRef, active, error, start } = useCamera()
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 })
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [stops, setStops] = useState<Map<string, Stop> | null>(null)
  const [status, setStatus] = useState<ScanStatus>({
    reading: '',
    confidence: 0,
    loading: false,
    progress: 0,
  })

  useEffect(() => {
    start()
  }, [start])

  useEffect(() => {
    let active = true
    loadStops()
      .then((map) => {
        if (active) setStops(map)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Guide box geometry (fraction of the on-screen container), memoized. A
  // short, wide strip so it hugs a single line of the 5-digit code — that is
  // exactly what the OCR engine is asked to read (PSM single line).
  const box: Rect | null = useMemo(() => {
    if (!containerSize.w || !containerSize.h) return null
    return {
      x: containerSize.w * 0.1,
      y: containerSize.h * 0.42,
      width: containerSize.w * 0.8,
      height: containerSize.h * 0.12,
    }
  }, [containerSize])

  const guide = useMemo(() => {
    if (!box || !videoSize.w) return null
    return containerBoxToVideoRect(
      videoSize.w,
      videoSize.h,
      containerSize.w,
      containerSize.h,
      box,
    )
  }, [videoSize, containerSize, box])

  useOcr({
    videoRef,
    enabled: active && guide != null,
    guide,
    onDetected,
    onStatus: setStatus,
    validate: (code) => stops?.has(code) ?? false,
  })

  // DEV-only: show the exact crop the OCR engine saw.
  useEffect(() => {
    if (status.preview && previewRef.current) {
      const c = previewRef.current
      const src = status.preview
      c.width = src.width
      c.height = src.height
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(src, 0, 0)
    }
  }, [status.preview])

  const copyRawText = async () => {
    const text = DEBUG_REFS.current.rawText
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  const saveDebugFrame = () => {
    const ref = DEBUG_REFS.current
    const payload = {
      savedAt: new Date().toISOString(),
      reading: status.reading,
      code: ref.code,
      confidence: ref.confidence,
      rawText: ref.rawText,
      cropDataUrl: ref.crop ? ref.crop.toDataURL('image/png') : null,
    }
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leneta-debug-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="screen scan-screen">
      <div className="camera-wrap" ref={wrapRef}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            setVideoSize({ w: v.videoWidth, h: v.videoHeight })
          }}
        />
        {box && <div className="guide-box" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} />}
        {ENABLE_OCR_DEBUG && (
          <canvas ref={previewRef} className="ocr-preview" />
        )}

        {ENABLE_OCR_DEBUG && !error && (
          <div className="scan-debug">
            <div className="scan-debug-head">
              <span className="scan-debug-title">OCR debug</span>
              <button
                type="button"
                className="debug-save"
                onClick={saveDebugFrame}
              >
                {saved ? 'Saved ✓' : 'Save frame'}
              </button>
              <button
                type="button"
                className="debug-save debug-save-alt"
                onClick={copyRawText}
              >
                {copied ? 'Copied ✓' : 'Copy raw text'}
              </button>
            </div>
            <div className="scan-debug-rows">
              <span>Reading: <b>{status.reading || '—'}</b></span>
              <span>Confidence: <b>{status.confidence ? `${Math.round(status.confidence * 100)}%` : '—'}</b></span>
              <span>
                5 digits: <b>{status.recognized ? 'OK' : '—'}</b>
              </span>
              <span className="scan-raw-text">
                Raw OCR: <b>{status.rawText?.trim() ? status.rawText.trim() : '—'}</b>
              </span>
            </div>
          </div>
        )}

        {error ? (
          <div className="camera-error">
            <p>{error}</p>
            <button type="button" className="btn" onClick={onManual}>
              Enter code manually
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Back
            </button>
          </div>
        ) : (
          <div className="scan-status">
            {status.loading ? (
              <>
                <span>Loading OCR…</span>
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${Math.round(status.progress * 100)}%` }} />
                </div>
              </>
            ) : (
              <span>
                {status.reading ? (
                  <>
                    Reading: {status.reading}
                    {status.confidence > 0 &&
                      ` · ${Math.round(status.confidence * 100)}%`}
                  </>
                ) : (
                  'Align the bus stop code in the box'
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {!error && (
        <div className="scan-actions">
          <button type="button" className="btn" onClick={onManual}>
            Type code
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
