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

export function formatEta(
  arrival: ArriveLahArrival | null,
  now = Date.now(),
): string {
  const mins = minsUntil(arrival, now)
  if (mins === null) return '-'
  if (mins <= 1) return 'Arriving'
  return `${mins} min`
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
