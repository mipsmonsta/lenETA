import { useEffect, useMemo, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useOcr, type ScanStatus } from '../hooks/useOcr'
import { containerBoxToVideoRect, type Rect } from '../lib/preprocessing'
import { loadStops } from '../lib/stops'
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

  const guide = useMemo(() => {
    if (!containerSize.w || !containerSize.h || !videoSize.w) return null
    const b: Rect = {
      x: containerSize.w * 0.12,
      y: containerSize.h * 0.3,
      width: containerSize.w * 0.76,
      height: containerSize.h * 0.28,
    }
    return containerBoxToVideoRect(
      videoSize.w,
      videoSize.h,
      containerSize.w,
      containerSize.h,
      b,
    )
  }, [videoSize, containerSize])

  const box: Rect | null = containerSize.w && containerSize.h
    ? {
        x: containerSize.w * 0.12,
        y: containerSize.h * 0.3,
        width: containerSize.w * 0.76,
        height: containerSize.h * 0.28,
      }
    : null

  useOcr({
    videoRef,
    enabled: active && guide != null,
    guide,
    onDetected,
    onStatus: setStatus,
    validate: (code) => stops?.has(code) ?? false,
    scale: 2,
  })

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
                {status.reading ? `Reading: ${status.reading}` : 'Align the bus stop code in the box'}
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
