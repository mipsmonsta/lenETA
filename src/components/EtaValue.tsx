import { etaLabel, formatEta, isScheduled } from '../lib/arrivals'
import type { ArriveLahArrival } from '../types'
import ClockIcon from './ClockIcon'

/**
 * An arrival's ETA. Live trips keep their countdown; scheduled
 * (`monitored: 0`) trips show their exact clock time behind a clock icon,
 * because that time comes from the timetable rather than a live estimate.
 */
export default function EtaValue({
  arrival,
  now,
}: {
  arrival: ArriveLahArrival | null
  now: number
}) {
  if (!arrival) return null
  if (!isScheduled(arrival)) return <>{formatEta(arrival, now)}</>
  return (
    <span className="sched-eta">
      <ClockIcon />
      {etaLabel(arrival, now)}
    </span>
  )
}
