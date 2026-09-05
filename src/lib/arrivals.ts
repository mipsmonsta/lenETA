import type { ArriveLahArrival, ArriveLahService, Load, Operator } from '../types'

export const LOAD_LABELS: Record<Load, string> = {
  SEA: 'Seats available',
  SDA: 'Standing available',
  LSD: 'Limited standing',
  LDA: 'Standing only',
}

export const OPERATOR_LABELS: Record<Operator, string> = {
  SBST: 'SBS Transit',
  SMRT: 'SMRT',
  TTS: 'Tower Transit',
  GAS: 'Go-Ahead',
}

export function minsUntil(
  arrival: ArriveLahArrival | null,
  now = Date.now(),
): number | null {
  if (!arrival?.time) return null
  const t = Date.parse(arrival.time)
  if (Number.isNaN(t)) return null
  return Math.round((t - now) / 60000)
}

/** True when the arrival is due essentially right now (<= 1 min away). */
export function etaIsNow(arrival: ArriveLahArrival | null, now = Date.now()): boolean {
  const mins = minsUntil(arrival, now)
  return mins !== null && mins <= 1
}

/**
 * True when the arrival is NOT live-tracked (no GPS), so its time comes from
 * the operating timetable rather than a live estimate. LTA returns
 * `monitored: 0` with zeroed coordinates for such rows.
 */
export function isScheduled(arrival: ArriveLahArrival | null): boolean {
  return arrival?.monitored === 0
}

/**
 * Wall-clock (HH:MM) of an arrival timestamp as *declared by the feed*
 * (+08:00 Singapore time in practice). The offset is read from the ISO
 * string itself, so it stays correct whatever time zone the phone is in
 * (and even if a future feed returns a different/`Z` offset).
 */
export function formatSgtTime(iso: string): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso)
  // No explicit offset → assume Singapore time (+08:00).
  let offsetMin = 480
  if (m) {
    offsetMin = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  }
  const wall = new Date(t + offsetMin * 60000)
  const hh = String(wall.getUTCHours()).padStart(2, '0')
  const mm = String(wall.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function formatEta(
  arrival: ArriveLahArrival | null,
  now = Date.now(),
): string {
  if (!arrival?.time) return '-'
  // Scheduled (monitored: 0) arrivals: show the exact clock time instead of
  // a relative countdown — the time is timetable-based, not a live estimate.
  if (isScheduled(arrival)) {
    return formatSgtTime(arrival.time) ?? '-'
  }
  const mins = minsUntil(arrival, now)
  if (mins === null) return '-'
  if (mins <= 1) return 'Arriving'
  return `${mins} min`
}

/**
 * Label for an arrival slot. For scheduled trips, a trip due "now" per the
 * schedule reads "Arriving" (it is still a planned time — callers mark it
 * with the clock icon), while future scheduled times show their exact clock
 * time. Live trips keep their countdown.
 */
export function etaLabel(
  arrival: ArriveLahArrival | null,
  now = Date.now(),
): string {
  if (!isScheduled(arrival)) return formatEta(arrival, now)
  return etaIsNow(arrival, now) ? 'Arriving' : formatEta(arrival, now)
}

export function averageHeadwayMinutes(service: ArriveLahService): number | null {
  const times = [service.next, service.next2, service.next3]
    .map((a) => (a?.time ? Date.parse(a.time) : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)
  if (times.length < 2) return null
  const gaps = []
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1])
  return Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length / 60000)
}

export function sortServices(
  services: ArriveLahService[],
  now = Date.now(),
): ArriveLahService[] {
  return [...services].sort((a, b) => {
    const am = minsUntil(a.next, now)
    const bm = minsUntil(b.next, now)
    if (am === null) return 1
    if (bm === null) return -1
    return am - bm
  })
}
