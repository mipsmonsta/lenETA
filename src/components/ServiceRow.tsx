import { formatEta, LOAD_LABELS, OPERATOR_LABELS } from '../lib/arrivals'
import type { ArriveLahService } from '../types'

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
        <div className="next">{formatEta(next, now)}</div>
        {arrivals.length > 1 && (
          <div className="subs">
            {arrivals.slice(1).map((a, i) => (
              <span key={i} className={i > 1 ? 'dim' : ''}>
                {formatEta(a, now)}
              </span>
            ))}
          </div>
        )}
        {next?.load && <div className="load">{LOAD_LABELS[next.load]}</div>}
      </div>
    </li>
  )
}
