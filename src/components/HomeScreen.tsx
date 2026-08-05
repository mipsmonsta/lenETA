import type { FavoriteStop } from '../types'
import FavoriteCard from './FavoriteCard'

export default function HomeScreen({
  favorites,
  onOpenStop,
  onScan,
  onManual,
  onRemove,
}: {
  favorites: FavoriteStop[]
  onOpenStop: (code: string) => void
  onScan: () => void
  onManual: () => void
  onRemove: (code: string) => void
}) {
  return (
    <div className="screen home">
      <header className="app-header">
        <h1>lenETA</h1>
        <p>Scan a bus stop code to see live bus arrivals.</p>
      </header>

      <div className="actions">
        <button type="button" className="btn primary" onClick={onScan}>
          Scan bus stop code
        </button>
        <button type="button" className="btn" onClick={onManual}>
          Enter code manually
        </button>
      </div>

      <section className="favorites">
        <h2>Favourite stops</h2>
        {favorites.length === 0 ? (
          <p className="hint">
            Stops you scan or enter will show up here so you can check them
            quickly.
          </p>
        ) : (
          <ul>
            {favorites.map((f) => (
              <FavoriteCard
                key={f.code}
                stop={f}
                onOpen={onOpenStop}
                onRemove={onRemove}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
