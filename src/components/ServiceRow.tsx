import {
  averageHeadwayMinutes,
  etaLabel,
  formatEta,
  isScheduled,
  LOAD_LABELS,
  OPERATOR_LABELS,
} from '../lib/arrivals'
import type { ArriveLahArrival, ArriveLahService } from '../types'
import ClockIcon from './ClockIcon'

export default function ServiceRow({
  service,
  now,
}: {
  service: ArriveLahService
  now: number
}) {
  const { no, operator } = service
  const arrivals = [service.next, service.next2, service.next3].filter((a) => a != null)
  const hasDd = arrivals.some((a) => a.type === 'DD')
  const hasBd = arrivals.some((a) => a.type === 'BD')
  const hasWab = arrivals.some((a) => a.feature?.includes('WAB'))
  const next = service.next
  const headway = averageHeadwayMinutes(service)

  /**
   * A scheduled (monitored: 0) trip has not started — its time is planned.
   * Mark it with a clock icon, and when it is due "now" per the schedule,
   * say "Arriving" only alongside the clock so it is clearly not a live bus.
   */
  const renderEta = (a: ArriveLahArrival | null) => {
    if (!a) return null
    if (!isScheduled(a)) return formatEta(a, now)
    const text = etaLabel(a, now)
    return (
      <span className="sched-eta">
        <ClockIcon />
        {text}
      </span>
    )
  }

  return (
    <li className="service">
      <div className="service-no">
        <span className="no">{no}</span>
        <span className="op">{OPERATOR_LABELS[operator] ?? operator}</span>
        <span className="badges">
          {hasWab && <span className="badge">WAB</span>}
          {hasDd && <span className="badge">DD</span>}
          {hasBd && <span className="badge">BD</span>}
        </span>
      </div>
      <div className="service-eta">
        <div className="next">{renderEta(next)}</div>
        {arrivals.length > 1 && (
          <div className="subs">
            {arrivals.slice(1).map((a, i) => (
              <span key={i} className={i > 1 ? 'dim' : ''}>
                {renderEta(a)}
              </span>
            ))}
          </div>
        )}
        {next?.load && <div className="load">{LOAD_LABELS[next.load]}</div>}
      </div>
      {headway != null && (
        <div className="service-headway">
          {headway === 0 ? 'Bus Bunching' : `~${headway} min headway`}
        </div>
      )}
    </li>
  )
}
