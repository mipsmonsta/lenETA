import { useState } from 'react'
import type { FavoriteStop } from '../types'
import FavoriteCard from './FavoriteCard'

const STEPS = [
  'On the bus stop pole, find the 5-digit number — usually on a green LTA plate.',
  'Tap "Scan bus stop code" and point the camera at the code.',
  'Keep the digits inside the guide box — pinch to zoom if the code is small.',
  'The app reads it automatically and shows live bus arrivals.',
]

/** Mini scan-screen graphic: guide box over a bus-stop code plaque. */
function ScanDiagram() {
  return (
    <svg
      className="guide-diagram"
      viewBox="0 0 320 132"
      role="img"
      aria-label="Phone viewfinder with a guide box over a 5-digit bus stop code"
    >
      {/* viewfinder screen */}
      <rect width="320" height="132" rx="18" fill="#0b2545" />
      <rect width="320" height="132" rx="18" fill="rgba(255,255,255,0.04)" />
      {/* guide box */}
      <rect
        x="34"
        y="34"
        width="252"
        height="64"
        rx="10"
        fill="rgba(242,183,5,0.12)"
        stroke="#f2b705"
        strokeWidth="2"
        strokeDasharray="7 5"
      />
      {/* bus-stop code plate — LTA's Lush Green unified signage */}
      <rect x="82" y="46" width="156" height="40" rx="7" fill="#0e8a3f" stroke="rgba(255,255,255,0.35)" />
      <text
        x="160"
        y="73"
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="24"
        fontWeight="700"
        fill="#ffffff"
        letterSpacing="2"
      >
        04229
      </text>
    </svg>
  )
}

export default function HomeScreen({
  favorites,
  guideDone,
  onGuideDone,
  onOpenStop,
  onScan,
  onManual,
  onRemove,
}: {
  favorites: FavoriteStop[]
  /** Whether the first-time guide has been completed (dismissed or scanned). */
  guideDone: boolean
  onGuideDone: () => void
  onOpenStop: (code: string) => void
  onScan: () => void
  onManual: () => void
  onRemove: (code: string) => void
}) {
  const [showHelp, setShowHelp] = useState(false)
  const showCard = showHelp || !guideDone

  const closeGuide = () => {
    setShowHelp(false)
    onGuideDone()
  }

  return (
    <div className="screen home">
      <header className="app-header">
        <h1>lenETA 🇸🇬</h1>
        <p>Scan a bus stop code for live Singapore public bus arrivals.</p>
      </header>

      <div className="actions">
        <button type="button" className="btn primary" onClick={onScan}>
          Scan bus stop code
        </button>
        <button type="button" className="btn" onClick={onManual}>
          Enter code manually
        </button>
      </div>

      {showCard && (
        <section className="guide-card" aria-label="How to scan a bus stop code">
          <h2 className="guide-card-title">How to scan a bus stop code</h2>
          <ScanDiagram />
          <ol className="guide-steps">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <button type="button" className="btn primary" onClick={closeGuide}>
            Got it
          </button>
        </section>
      )}

      {!showCard && (
        <button
          type="button"
          className="guide-link"
          onClick={() => setShowHelp(true)}
        >
          How to scan?
        </button>
      )}

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
