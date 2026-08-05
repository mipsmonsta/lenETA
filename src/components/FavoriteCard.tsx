import { useArrivals } from '../hooks/useArrivals'
import { formatEta, sortServices } from '../lib/arrivals'
import type { FavoriteStop } from '../types'

export default function FavoriteCard({
  stop,
  onOpen,
  onRemove,
}: {
  stop: FavoriteStop
  onOpen: (code: string) => void
  onRemove: (code: string) => void
}) {
  const { data, loading } = useArrivals(stop.code, 0)
  const next = data ? sortServices(data.services)[0] : null

  return (
    <li className="fav-card" onClick={() => onOpen(stop.code)}>
      <div className="fav-info">
        <span className="fav-name">{stop.name}</span>
        <span className="fav-road">{stop.road} · {stop.code}</span>
      </div>
      <div className="fav-eta">
        {loading && <span className="dim">…</span>}
        {!loading && next && <strong>{formatEta(next.next)}</strong>}
        {!loading && next && <span className="dim">bus {next.no}</span>}
        {!loading && !next && <span className="dim">No buses</span>}
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label="Remove stop"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(stop.code)
        }}
      >
        ✕
      </button>
    </li>
  )
}
