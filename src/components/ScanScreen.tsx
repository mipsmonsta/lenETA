import { useEffect, useMemo, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useOcr, DEBUG_REFS, type ScanStatus } from '../hooks/useOcr'
import { containerBoxToVideoRect, type Rect } from '../lib/preprocessing'
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
  const cellsRef = useRef<HTMLCanvasElement | null>(null)
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
  // short, wide strip so it hugs a single line of the 5-digit code instead of
  // grabbing several rows of the poster (which flooded the crop with thin
  // text rows and made binarization pick a noise band).
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

  useEffect(() => {
    if (status.preview && previewRef.current) {
      const c = previewRef.current
      c.width = status.preview.width
      c.height = status.preview.height
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(status.preview, 0, 0)
      // Overlay segmentation boxes so the dev can see *where* each digit was
      // found (green) vs. a rejected frame (red, from runDiagnostic).
      const boxes = status.boxes
      ctx.strokeStyle = boxes && boxes.length === 5 ? '#2ee66a' : '#ff4455'
      ctx.lineWidth = 1
      for (const b of status.boxes ?? []) {
        ctx.strokeRect(b.x, b.y, b.width, b.height)
      }
    }
  }, [status.preview, status.boxes])

  // Render the 5 normalized 28x28 input cells the CNN sees, so we can spot
  // whether a misread is due to malformed cells (blobs/lopsided) or the model.
  useEffect(() => {
    const cvs = cellsRef.current
    const cells = status.cells
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    if (!cells) return
    const cellPx = 18
    const gap = 2
    ctx.clearRect(0, 0, cvs.width, cvs.height)
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      const ox = i * (cellPx + gap)
      for (let yy = 0; yy < 28; yy++) {
        for (let xx = 0; xx < 28; xx++) {
          const v = cell[yy * 28 + xx]
          const ink = v / 255
          ctx.fillStyle = `rgba(255,255,255,${ink})`
          ctx.fillRect(ox + xx, yy, 1, 1)
        }
      }
    }
  }, [status.cells])

  const copyAscii = async () => {
    const { bin } = DEBUG_REFS.current
    if (!bin) return
    const cols = 56
    const scale = Math.max(1, Math.ceil(bin.width / cols))
    let ascii = `crop ${bin.width}x${bin.height}\n`
    for (let y = 0; y < bin.height; y += Math.max(1, scale)) {
      let line = ''
      for (let x = 0; x < bin.width; x += scale) {
        line += bin.data[y * bin.width + x] === 1 ? '##' : '  '
      }
      ascii += line + '\n'
    }
    try {
      await navigator.clipboard.writeText(ascii)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  const saveDebugFrame = () => {
    const { bin, boxes } = DEBUG_REFS.current
    const diag = status.diagnostic
    const payload = {
      savedAt: new Date().toISOString(),
      reading: status.reading,
      confidence: status.confidence,
      perDigitConf: status.perDigitConf ?? [],
      // 28x28 input cells the CNN actually saw (0..255 ink, row-major).
      cells: status.cells ?? null,
      diagnostic: diag
        ? { segmentCount: diag.segmentCount, failReason: diag.failReason }
        : null,
      binWidth: bin?.width ?? 0,
      binHeight: bin?.height ?? 0,
      // 1 = ink, 0 = background, as a compact row-run-length array.
      rle: bin ? rleEncode(bin.data) : [],
      boxes: boxes
        ? boxes.map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height }))
        : null,
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
                onClick={copyAscii}
              >
                {copied ? 'Copied ✓' : 'Copy binarized'}
              </button>
            </div>
            <div className="scan-debug-rows">
              <span>Reading: <b>{status.reading || '—'}</b></span>
              <span>Conf (mean): <b>{status.confidence ? `${Math.round(status.confidence * 100)}%` : '—'}</b></span>
              <span>Per-digit: <b>{status.perDigitConf?.length ? status.perDigitConf.map((p) => Math.round(p * 100)).join(', ') : '—'}%</b></span>
              <span>
                Segments: <b>{status.diagnostic?.segmentCount ?? '—'}/5</b>{' '}
                <span className={status.diagnostic?.segmentCount === 5 ? 'dbg-ok' : 'dbg-bad'}>
                  {status.diagnostic?.segmentCount === 5 ? 'OK' : 'FAIL'}
                </span>
              </span>
              <span>
                Fail stage:{' '}
                <span className={failStageClass(status.diagnostic?.failReason)}>
                  <b>{failStageLabel(status.diagnostic?.failReason)}</b>
                </span>
              </span>
              {status.cells && status.cells.length > 0 && (
                <div className="scan-cells">
                  <div className="scan-cells-label">CNN inputs (28×28):</div>
                  <canvas
                    ref={cellsRef}
                    width={5 * 18 + 4 * 2}
                    height={28}
                    className="cells-canvas"
                  />
                </div>
              )}
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

/**
 * Compact row-run-length encoding of a binary image for the saved debug JSON:
 * [[runValue, runLength], ...] flat over all pixels, 1 = ink, 0 = background.
 */
function rleEncode(data: Uint8Array): number[] {
  const out: number[] = []
  if (data.length === 0) return out
  let prev = data[0]
  let run = 0
  for (let i = 0; i < data.length; i++) {
    if (data[i] === prev) {
      run++
    } else {
      out.push(prev, run)
      prev = data[i]
      run = 1
    }
  }
  out.push(prev, run)
  return out
}

/** Human-readable label + CSS class for the OCR fail stage. */
function failStageLabel(reason: string | null | undefined): string {
  switch (reason) {
    case 'low-contrast':
      return 'LOW CONTRAST (binarizer rejected crop)'
    case 'no-ink':
      return 'NO INK (binarizer empty)'
    case 'no-band':
      return 'NO TEXT ROW (no-band)'
    case 'seg-not-5':
      return 'NOT 5 DIGITS (seg-not-5)'
    case 'empty-cell':
      return 'EMPTY CELL'
    default:
      return reason ?? '—'
  }
}

function failStageClass(reason: string | null | undefined): string {
  return reason && !['seg-not-5', 'empty-cell'].includes(reason)
    ? 'dbg-bad'
    : 'dbg-warn'
}
