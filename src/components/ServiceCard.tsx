import { averageHeadwayMinutes, LOAD_LABELS, OPERATOR_LABELS } from '../lib/arrivals'
import type { ArriveLahArrival, ArriveLahService, BusType, Stop } from '../types'
import EtaValue from './EtaValue'

/** Only deck types worth calling out; "SD" (single deck) is the default. */
function deckTag(type: BusType | null): string {
  return type === 'DD' || type === 'BD' ? type : ''
}

/**
 * Full detail for one bus service, shown as a page of the stop carousel.
 * Returns the card body only — the carousel wrapper owns sizing and the
 * taper transform.
 */
export default function ServiceCard({
  service,
  now,
  stops,
}: {
  service: ArriveLahService
  now: number
  stops: Map<string, Stop> | null
}) {
  const { no, operator } = service
  const arrivals = [service.next, service.next2, service.next3].filter(
    (a): a is ArriveLahArrival => a != null,
  )
  const [next, ...later] = arrivals
  const hasDd = arrivals.some((a) => a.type === 'DD')
  const hasBd = arrivals.some((a) => a.type === 'BD')
  const hasWab = arrivals.some((a) => a.feature?.includes('WAB'))
  const headway = averageHeadwayMinutes(service)

  // The route's terminus, resolved from the bundled stop dataset. Omitted
  // entirely when the feed has no code or the code is unknown.
  const terminus =
    (next?.destination_code && stops?.get(next.destination_code)?.name) || null

  return (
    <article className="card-body">
      <header className="card-head">
        <span className="card-no">{no}</span>
        <span className="card-op">{OPERATOR_LABELS[operator] ?? operator}</span>
      </header>

      <div className="badges">
        {hasWab && <span className="badge">WAB</span>}
        {hasDd && <span className="badge">DD</span>}
        {hasBd && <span className="badge">BD</span>}
      </div>

      <div className="hero">
        <div className="hero-eta">
          <EtaValue arrival={next} now={now} />
        </div>
        <div className="hero-meta">
          {next?.load && <span>{LOAD_LABELS[next.load]}</span>}
          {terminus && <span className="hero-dest">towards {terminus}</span>}
        </div>
      </div>

      {later.length > 0 && (
        <div className="card-section">
          <span className="section-label">Later buses</span>
          <ul className="later-list">
            {later.map((a, i) => (
              <li key={i} className={i > 0 ? 'dim' : undefined}>
                <span className="later-eta">
                  <EtaValue arrival={a} now={now} />
                </span>
                <span className="later-load">
                  {a.load ? LOAD_LABELS[a.load] : ''}
                </span>
                <span className="later-deck">{deckTag(a.type)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="card-foot">
        {headway != null
          ? headway === 0
            ? 'Bus Bunching'
            : `~${headway} min headway`
          : ''}
      </footer>
    </article>
  )
}
