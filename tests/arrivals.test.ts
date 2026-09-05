import { describe, expect, it } from 'vitest'
import {
  formatEta,
  formatSgtTime,
  isScheduled,
  minsUntil,
} from '../src/lib/arrivals'
import type { ArriveLahArrival } from '../src/types'

const NOW = Date.parse('2026-09-05T14:00:00+08:00')

function arrival(partial: Partial<ArriveLahArrival>): ArriveLahArrival {
  return {
    time: '',
    duration_ms: 0,
    lat: 0,
    lng: 0,
    load: 'SEA',
    feature: 'WAB',
    type: 'SD',
    visit_number: 1,
    origin_code: '',
    destination_code: '',
    monitored: 1,
    ...partial,
  }
}

describe('scheduled (monitored: 0) arrivals show exact SG clock time', () => {
  it('isScheduled is true only for monitored === 0', () => {
    expect(isScheduled(arrival({ monitored: 0 }))).toBe(true)
    expect(isScheduled(arrival({ monitored: 1 }))).toBe(false)
    expect(isScheduled(arrival({ monitored: undefined as unknown as number }))).toBe(false)
    expect(isScheduled(null)).toBe(false)
  })

  it('formatSgtTime renders the offset wall-clock, timezone independent', () => {
    expect(formatSgtTime('2026-09-05T14:24:00+08:00')).toBe('14:24')
    // Across the UTC date boundary the +08:00 wall clock must hold.
    expect(formatSgtTime('2026-09-05T00:05:00+08:00')).toBe('00:05')
    expect(formatSgtTime('2026-09-05T23:59:00+08:00')).toBe('23:59')
  })

  it('formatSgtTime handles Z / missing-offset inputs sensibly', () => {
    // Z (UTC 14:00) is 22:00 in Singapore.
    expect(formatSgtTime('2026-09-05T14:00:00Z')).toBe('22:00')
    // Naive strings are treated as Singapore time.
    expect(formatSgtTime('2026-09-05T14:24:00')).toBe('14:24')
    expect(formatSgtTime('garbage')).toBeNull()
    expect(formatSgtTime('')).toBeNull()
  })

  it('formatEta shows clock time for monitored: 0 (all slots share the type)', () => {
    const sched = arrival({
      time: '2026-09-05T14:30:03+08:00',
      monitored: 0,
    })
    expect(formatEta(sched, NOW)).toBe('14:30')
    // Invalid time on a scheduled row falls back to '-'.
    expect(formatEta(arrival({ time: 'nope', monitored: 0 }), NOW)).toBe('-')
  })

  it('keeps relative countdown for live (monitored: 1) rows', () => {
    const in12 = arrival({
      time: new Date(NOW + 12 * 60000).toISOString(),
      monitored: 1,
    })
    expect(formatEta(in12, NOW)).toBe('12 min')
    const soon = arrival({
      time: new Date(NOW + 30_000).toISOString(),
      monitored: 1,
    })
    expect(formatEta(soon, NOW)).toBe('Arriving')
    // A live row missing the field still uses the relative path.
    const missing = arrival({
      time: new Date(NOW + 12 * 60000).toISOString(),
      monitored: undefined as unknown as number,
    })
    expect(formatEta(missing, NOW)).toBe('12 min')
  })

  it('does not regress minsUntil', () => {
    const a = arrival({ time: new Date(NOW + 12 * 60000).toISOString() })
    expect(minsUntil(a, NOW)).toBe(12)
    expect(minsUntil(null, NOW)).toBeNull()
  })
})
