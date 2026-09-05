import { useEffect, useState } from 'react'
import { useArrivals } from '../hooks/useArrivals'
import { useStops } from '../hooks/useStops'
import { isScheduled, sortServicesByNo } from '../lib/arrivals'
import ServiceRow from './ServiceRow'
import ClockIcon from './ClockIcon'

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

  const stop = stops?.get(code) ?? null
  const services = data ? sortServicesByNo(data.services) : []
  const hasScheduled = data
    ? data.services.some((s) =>
        [s.next, s.next2, s.next3].some((a) => a != null && isScheduled(a)),
      )
    : false
  const lastUpdated = updatedAt
    ? new Date(updatedAt).toLocaleTimeString()
    : null

  return (
    <div className="screen results-screen">
      <header className="results-header">
        <button type="button" className="btn small" onClick={onBack}>
          ← Back
        </button>
        <div className="results-title">
          <h1>{stop ? stop.name : `Stop ${code}`}</h1>
          <p>{stop ? `${stop.road} · ${stop.code}` : 'Stop code ' + code}</p>
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
        <p className="hint">
          No buses in operation at this stop right now.
        </p>
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
        <ul className="service-list">
          {services.map((s) => (
            <ServiceRow key={s.no} service={s} now={now} />
          ))}
        </ul>
      )}

      {!stop && !loading && (
        <p className="hint dim">This stop code is not in the Singapore stop list.</p>
      )}
    </div>
  )
}
