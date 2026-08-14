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
