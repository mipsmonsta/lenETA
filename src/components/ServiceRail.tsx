import { useEffect, useRef } from 'react'
import { compactEta } from '../lib/arrivals'
import type { ArriveLahService } from '../types'

/**
 * Horizontal strip of service chips: the carousel's index, its overview, and
 * the accessible way to reach any service directly. A circular carousel has no
 * fixed ends, so this rail is what keeps the position legible.
 */
export default function ServiceRail({
  services,
  activeIndex,
  now,
  onSelect,
  onPrev,
  onNext,
}: {
  services: ArriveLahService[]
  activeIndex: number
  now: number
  onSelect: (index: number) => void
  onPrev: () => void
  onNext: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([])
  const single = services.length <= 1

  // Centre the active chip. Done by arithmetic rather than scrollIntoView,
  // which would also scroll the page vertically.
  useEffect(() => {
    const track = trackRef.current
    const chip = chipRefs.current[activeIndex]
    if (!track || !chip) return
    track.scrollLeft = chip.offsetLeft - (track.clientWidth - chip.offsetWidth) / 2
  }, [activeIndex])

  return (
    <div className="service-rail">
      <button
        type="button"
        className="rail-nav"
        aria-label="Previous service"
        disabled={single}
        onClick={onPrev}
      >
        ‹
      </button>

      <div className="rail-track" ref={trackRef}>
        {services.map((s, i) => (
          <button
            key={s.no}
            ref={(el) => {
              chipRefs.current[i] = el
            }}
            type="button"
            className={`rail-chip${i === activeIndex ? ' active' : ''}`}
            aria-current={i === activeIndex ? 'true' : undefined}
            onClick={() => onSelect(i)}
          >
            <span className="chip-no">{s.no}</span>
            <span className="chip-eta">{compactEta(s.next, now)}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="rail-nav"
        aria-label="Next service"
        disabled={single}
        onClick={onNext}
      >
        ›
      </button>
    </div>
  )
}
