export default function SettingsScreen({
  ocrDebug,
  onOcrDebugChange,
  onBack,
}: {
  ocrDebug: boolean
  onOcrDebugChange: (enabled: boolean) => void
  onBack: () => void
}) {
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
        <label className="setting-row">
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
