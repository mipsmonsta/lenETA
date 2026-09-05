import { useEffect, useMemo, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useOcr, DEBUG_REFS, type ScanStatus } from '../hooks/useOcr'
import { containerBoxToVideoRect, zoomRectAbout, type Rect } from '../lib/geometry'
import { loadStops } from '../lib/stops'
import { ENABLE_OCR_DEBUG } from '../lib/debug'
import type { Stop } from '../types'

/** Digital zoom bounds: 1× = full frame; 4× is plenty for a pole-mounted code. */
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_PX = 48
const ZOOM_STEP = 1.25

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

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

  // --- camera zoom -------------------------------------------------------
  const [zoom, setZoomState] = useState(MIN_ZOOM)
  const zoomRef = useRef(MIN_ZOOM)
  const setZoom = (z: number) => {
    const zz = clampZoom(z)
    zoomRef.current = zz
    setZoomState(zz)
  }
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null)
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null)
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // pointer may already be gone
    }
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()]
      pinchRef.current = { dist: dist(pts[0], pts[1]), zoom: zoomRef.current }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointersRef.current.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    p.y = e.clientY
    const base = pinchRef.current
    if (base && pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()]
      const d = dist(pts[0], pts[1])
      if (d > 0) setZoom(base.zoom * (d / base.dist))
    }
  }

  const onPointerEnd = (e: React.PointerEvent) => {
    const wasPinching = pointersRef.current.size >= 2
    const first = pointersRef.current.get(e.pointerId)
    pointersRef.current.delete(e.pointerId)
    pinchRef.current = null
    // Double-tap (touch only, not a pinch, not on a button) toggles 1× ↔ 2.5×.
    if (
      !wasPinching &&
      e.pointerType === 'touch' &&
      pointersRef.current.size === 0 &&
      first &&
      !(e.target as HTMLElement | null)?.closest?.('button')
    ) {
      const now = performance.now()
      const last = lastTapRef.current
      if (
        last &&
        now - last.t < DOUBLE_TAP_MS &&
        Math.hypot(first.x - last.x, first.y - last.y) < DOUBLE_TAP_PX
      ) {
        setZoom(zoomRef.current > MIN_ZOOM ? MIN_ZOOM : 2.5)
        lastTapRef.current = null
        return
      }
      lastTapRef.current = { t: now, x: first.x, y: first.y }
    }
  }

  const onPointerCancel = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    pinchRef.current = null
  }

  // Mouse wheel (desktop / dev) zooms too.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(zoomRef.current * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Zoom is anchored on the guide-box centre so the code you keep inside the
  // box stays centred while you magnify it.
  const anchor = useMemo(
    () =>
      box
        ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        : { x: 0, y: 0 },
    [box],
  )

  const videoTransform = useMemo(() => {
    if (zoom === MIN_ZOOM) return undefined
    return {
      transform: `translate(${anchor.x * (1 - zoom)}px, ${anchor.y * (1 - zoom)}px) scale(${zoom})`,
      transformOrigin: '0 0',
    } as const
  }, [zoom, anchor])

  // The (unzoomed) frame region that currently sits under the guide box.
  // Feeding this to OCR means a zoomed capture recognises exactly what the
  // user framed — and bigger digits on screen, which Tesseract reads better.
  const cropBox = useMemo(
    () => (box ? zoomRectAbout(box, anchor, zoom) : null),
    [box, anchor, zoom],
  )

  const guide = useMemo(() => {
    if (!cropBox || !videoSize.w) return null
    return containerBoxToVideoRect(
      videoSize.w,
      videoSize.h,
      containerSize.w,
      containerSize.h,
      cropBox,
    )
  }, [videoSize, containerSize, cropBox])

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
      zoom,
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
      <div
        className="camera-wrap"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerCancel}
      >
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={videoTransform}
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

        {!error && (
          <div className="zoom-controls" aria-label="Camera zoom">
            <span className="zoom-value">
              {zoom > MIN_ZOOM ? `${zoom.toFixed(1)}×` : ''}
            </span>
            <button
              type="button"
              className="zoom-btn"
              aria-label="Zoom out"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom(zoomRef.current / ZOOM_STEP)}
            >
              −
            </button>
            <button
              type="button"
              className="zoom-btn"
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom(zoomRef.current * ZOOM_STEP)}
            >
              +
            </button>
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
                  'Align the code in the box · pinch to zoom'
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
