import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useArrivals } from '../hooks/useArrivals'
import { useStops } from '../hooks/useStops'
import { isScheduled, sortServicesByNo } from '../lib/arrivals'
import {
  indexOfServiceNo,
  pagerPositionFromScroll,
  positionFromRealIndex,
  realIndexFromPosition,
  scrollLeftForPosition,
  shortestCircularDelta,
  wrapTargetPosition,
} from '../lib/pager'
import ClockIcon from './ClockIcon'
import ServiceCard from './ServiceCard'
import ServiceRail from './ServiceRail'

/** How long the track must be still before we check whether to wrap. */
const SETTLE_MS = 100
/** Attempts allowed for the initial centring if layout is not measured yet. */
const MAX_CENTRE_TRIES = 12

/**
 * Taper falloff for a card `distance` steps from the centre. Continuous rather
 * than stepped, so neighbours recede smoothly while dragging.
 */
function taperFor(distance: number): {
  scale: number
  opacity: number
  rotate: number
} {
  const d = Math.abs(distance)
  const dir = distance === 0 ? 0 : distance > 0 ? 1 : -1
  return {
    scale: Math.max(0.8, 1 - 0.1 * d),
    opacity: Math.max(0.2, 1 - 0.38 * d),
    rotate: dir * Math.min(15, 9 * d),
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

export default function StopResults({
  code,
  onBack,
  favorite,
  onToggleFavorite,
}: {
  code: string
  onBack: () => void
  favorite: boolean
  onToggleFavorite: (code: string) => void
}) {
  const { stops } = useStops()
  const { data, loading, error, updatedAt, refresh } = useArrivals(code)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 10000)
    return () => window.clearInterval(t)
  }, [])

  const services = useMemo(
    () => (data ? sortServicesByNo(data.services) : []),
    [data],
  )
  const count = services.length

  /**
   * The track's cards: a clone of the last service at position 0, the real
   * services at 1..N, and a clone of the first at N + 1. Clones make the
   * carousel wrap; they are `aria-hidden` because the real cards are all
   * present. A single service needs no seam, so it is rendered alone.
   */
  const virtualCards = useMemo(() => {
    if (count === 0) return []
    if (count === 1) {
      return [
        { key: services[0].no, position: 0, service: services[0], clone: false },
      ]
    }
    return [
      {
        key: `clone-last-${services[count - 1].no}`,
        position: 0,
        service: services[count - 1],
        clone: true,
      },
      ...services.map((s, i) => ({
        key: s.no,
        position: i + 1,
        service: s,
        clone: false,
      })),
      {
        key: `clone-first-${services[0].no}`,
        position: count + 1,
        service: services[0],
        clone: true,
      },
    ]
  }, [services, count])
  const virtualCount = virtualCards.length

  const trackRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])
  const positionRef = useRef(1)
  const activeNoRef = useRef<string | null>(null)
  const [position, setPosition] = useState(1)

  /** Distance between adjacent cards, measured from the laid-out DOM. */
  const measureStride = useCallback(() => {
    const cards = cardRefs.current
    if (cards[0] && cards[1]) return cards[1].offsetLeft - cards[0].offsetLeft
    return cards[0]?.offsetWidth ?? 0
  }, [])

  /**
   * Record the settled position. `activeNoRef` is captured here — while the
   * closure still sees the service list this position belongs to — so a later
   * refresh can restore the same service by number.
   */
  const commitPosition = useCallback(
    (pos: number) => {
      positionRef.current = pos
      setPosition(pos)
      const svc = services[realIndexFromPosition(pos, count)]
      activeNoRef.current = svc ? svc.no : null
    },
    [services, count],
  )

  const applyTaper = useCallback(
    (scrollLeft: number, stride: number) => {
      if (stride <= 0 || count === 0) return
      // Continuous centre in real-index space: the clone at position 0 maps to
      // real index count-1, so the ring math stays correct across the seam.
      const centre = scrollLeft / stride - 1
      for (let p = 0; p < virtualCount; p++) {
        const el = cardRefs.current[p]
        if (!el) continue
        const d = shortestCircularDelta(
          realIndexFromPosition(p, count),
          centre,
          count,
        )
        const t = taperFor(d)
        el.style.transform = `scale(${t.scale.toFixed(3)}) rotateY(${t.rotate.toFixed(2)}deg)`
        el.style.opacity = t.opacity.toFixed(3)
        el.style.zIndex = String(50 - Math.round(Math.abs(d)))
      }
    },
    [count, virtualCount],
  )

  // Scroll -> live taper, active position, and (once the track is still) the
  // seamless jump from a cloned card to its real twin.
  useEffect(() => {
    const track = trackRef.current
    if (!track || virtualCount === 0) return
    let raf = 0
    let settle = 0

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        const stride = measureStride()
        applyTaper(track.scrollLeft, stride)

        const p = pagerPositionFromScroll(track.scrollLeft, stride, virtualCount)
        if (p !== positionRef.current) commitPosition(p)

        if (settle) window.clearTimeout(settle)
        settle = window.setTimeout(() => {
          const s = measureStride()
          const at = pagerPositionFromScroll(track.scrollLeft, s, virtualCount)
          const target = wrapTargetPosition(at, count)
          if (target === null) return
          track.scrollTo({
            left: scrollLeftForPosition(target, s),
            behavior: 'auto',
          })
          commitPosition(target)
        }, SETTLE_MS)
      })
    }

    track.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      track.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
      if (settle) window.clearTimeout(settle)
    }
  }, [
    applyTaper,
    commitPosition,
    count,
    measureStride,
    virtualCount,
  ])

  // Centre the real first service for each stop. Retried across a few frames
  // because the stride is unmeasurable until the cards are laid out.
  const centredForCode = useRef<string | null>(null)
  useEffect(() => {
    const track = trackRef.current
    if (!track || count === 0) return
    if (centredForCode.current === code) return

    let tries = 0
    const centre = () => {
      const stride = measureStride()
      if (stride <= 0) {
        if (tries++ < MAX_CENTRE_TRIES) window.requestAnimationFrame(centre)
        return
      }
      centredForCode.current = code
      const pos = 1
      track.scrollTo({ left: scrollLeftForPosition(pos, stride), behavior: 'auto' })
      commitPosition(pos)
      applyTaper(track.scrollLeft, stride)
    }
    centre()
  }, [applyTaper, code, commitPosition, count, measureStride])

  // Keep the same service centred when the service list grows or shrinks after
  // an auto-refresh; fall back to the first service if it is gone.
  const prevCount = useRef(0)
  useEffect(() => {
    const track = trackRef.current
    if (!track || count === 0) return
    const prev = prevCount.current
    prevCount.current = count
    if (prev === 0 || prev === count) return
    const stride = measureStride()
    if (stride <= 0) return
    const pos = positionFromRealIndex(
      indexOfServiceNo(services, activeNoRef.current),
    )
    track.scrollTo({ left: scrollLeftForPosition(pos, stride), behavior: 'auto' })
    commitPosition(pos)
    applyTaper(track.scrollLeft, stride)
  }, [applyTaper, commitPosition, count, measureStride, services])

  const scrollToPosition = useCallback(
    (pos: number, smooth: boolean) => {
      const track = trackRef.current
      if (!track) return
      const stride = measureStride()
      if (stride <= 0) return
      const clamped = Math.max(0, Math.min(virtualCount - 1, pos))
      track.scrollTo({
        left: scrollLeftForPosition(clamped, stride),
        behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
      })
    },
    [measureStride, virtualCount],
  )

  /** Chevrons step through virtual positions, so they wrap via the clones. */
  const step = useCallback(
    (delta: number) => {
      const track = trackRef.current
      if (!track || count <= 1) return
      const stride = measureStride()
      const current = pagerPositionFromScroll(track.scrollLeft, stride, virtualCount)
      scrollToPosition(current + delta, true)
    },
    [count, measureStride, scrollToPosition, virtualCount],
  )

  const activeIndex = realIndexFromPosition(position, count)

  const hasScheduled = data
    ? data.services.some((s) =>
        [s.next, s.next2, s.next3].some((a) => a != null && isScheduled(a)),
      )
    : false
  const lastUpdated = updatedAt
    ? new Date(updatedAt).toLocaleTimeString()
    : null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    }
  }

  return (
    <div className="screen results-screen">
      <header className="results-header">
        <button type="button" className="btn small" onClick={onBack}>
          ← Back
        </button>
        <div className="results-title">
          <h1>{stops?.get(code)?.name ?? `Stop ${code}`}</h1>
          <p>
            {stops?.get(code)
              ? `${stops.get(code)!.road} · ${code}`
              : 'Stop code ' + code}
          </p>
        </div>
        <button
          type="button"
          className={`btn small ${favorite ? 'fav-on' : ''}`}
          onClick={() => onToggleFavorite(code)}
        >
          {favorite ? '★ Saved' : '☆ Save'}
        </button>
      </header>

      <div className="results-meta">
        <span className="dim">
          Updated {lastUpdated ?? '…'} · auto-refresh every 30s
        </span>
        <button type="button" className="btn small" onClick={refresh}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="notice error">
          <p>{error}</p>
          <button type="button" className="btn" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {loading && services.length === 0 && !error && (
        <p className="hint">Fetching arrivals…</p>
      )}

      {!loading && !error && services.length === 0 && (
        <p className="hint">No buses in operation at this stop right now.</p>
      )}

      {services.length > 0 && hasScheduled && (
        <div className="notice info" role="note">
          <ClockIcon />
          <span>
            “Arriving” with a clock icon, or exact times, are scheduled times —
            buses may not arrive as scheduled, subject to operational
            adjustments. Live buses are shown in “N min” format or “Arriving”
            (without a clock icon).
          </span>
        </div>
      )}

      {services.length > 0 && (
        <ServiceRail
          services={services}
          activeIndex={activeIndex}
          now={now}
          onSelect={(i) => scrollToPosition(positionFromRealIndex(i), true)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      )}

      {services.length > 0 && (
        <div className="carousel">
          <div
            className="carousel-track"
            ref={trackRef}
            tabIndex={0}
            role="group"
            aria-roledescription="carousel"
            aria-label="Bus services at this stop"
            onKeyDown={onKeyDown}
          >
            {virtualCards.map((c) => (
              <div
                key={c.key}
                className="carousel-card"
                ref={(el) => {
                  cardRefs.current[c.position] = el
                }}
                aria-hidden={c.clone ? 'true' : undefined}
              >
                <ServiceCard service={c.service} now={now} stops={stops} />
              </div>
            ))}
          </div>
          <div className="pager-position">
            {activeIndex + 1} of {count}
          </div>
        </div>
      )}

      {!stops?.get(code) && !loading && (
        <p className="hint dim">This stop code is not in the Singapore stop list.</p>
      )}
    </div>
  )
}
