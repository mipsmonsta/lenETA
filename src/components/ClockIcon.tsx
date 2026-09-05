/** Small clock-face icon (inline SVG, inherits currentColor). */
export default function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'clock-icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3.2 1.9" />
    </svg>
  )
}
