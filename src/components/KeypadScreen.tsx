import { useState } from 'react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export default function KeypadScreen({
  onSubmit,
  onClose,
}: {
  onSubmit: (code: string) => void
  onClose: () => void
}) {
  const [digits, setDigits] = useState('')

  const press = (key: string) => {
    if (key === 'del') {
      setDigits((d) => d.slice(0, -1))
      return
    }
    if (digits.length >= 5) return
    const next = digits + key
    setDigits(next)
    if (next.length === 5) {
      window.setTimeout(() => onSubmit(next), 120)
    }
  }

  return (
    <div className="screen keypad-screen">
      <header className="app-header">
        <h1>Enter stop code</h1>
        <p>Type the 5-digit bus stop code from the pole.</p>
      </header>

      <div className="code-display">
        <span className={digits.length === 5 ? 'code-full' : ''}>
          {digits.padEnd(5, '_')}
        </span>
      </div>

      <div className="keypad">
        {KEYS.map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              className={`key ${key === 'del' ? 'key-del' : ''}`}
              onClick={() => press(key)}
              disabled={key === 'del' && digits.length === 0}
            >
              {key === 'del' ? '⌫' : key}
            </button>
          ),
        )}
      </div>

      <div className="scan-actions">
        <button type="button" className="btn" onClick={onClose}>
          Back
        </button>
      </div>
    </div>
  )
}
