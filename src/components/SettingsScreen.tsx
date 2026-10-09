import type { ServiceLayout } from '../types'

export default function SettingsScreen({
  ocrDebug,
  onOcrDebugChange,
  serviceLayout,
  onServiceLayoutChange,
  onBack,
}: {
  ocrDebug: boolean
  onOcrDebugChange: (enabled: boolean) => void
  serviceLayout: ServiceLayout
  onServiceLayoutChange: (layout: ServiceLayout) => void
  onBack: () => void
}) {
  const layouts: Array<{ value: ServiceLayout; label: string }> = [
    { value: 'carousel', label: 'Carousel' },
    { value: 'list', label: 'List' },
  ]

  return (
    <div className="screen settings-screen">
      <header className="results-header">
        <button type="button" className="btn small" onClick={onBack}>
          ← Back
        </button>
        <div className="results-title">
          <h1>Settings</h1>
        </div>
      </header>

      <section className="settings-group">
        <div className="setting-row">
          <span className="setting-text">
            <span className="setting-name">Service layout</span>
            <span className="setting-desc">
              Show the services at a stop as a swipeable circular carousel, or
              as a plain vertical list.
            </span>
          </span>
          <div className="segmented" role="group" aria-label="Service layout">
            {layouts.map((l) => (
              <button
                key={l.value}
                type="button"
                className={`segment${serviceLayout === l.value ? ' active' : ''}`}
                aria-pressed={serviceLayout === l.value}
                onClick={() => onServiceLayoutChange(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <label className="setting-row toggle">
          <span className="setting-text">
            <span className="setting-name">OCR debug panel</span>
            <span className="setting-desc">
              Show the live crop, raw OCR text and confidence while scanning.
              Useful for diagnosing misreads on a real device.
            </span>
          </span>
          <input
            type="checkbox"
            className="setting-toggle"
            checked={ocrDebug}
            onChange={(e) => onOcrDebugChange(e.target.checked)}
          />
        </label>
      </section>
    </div>
  )
}
