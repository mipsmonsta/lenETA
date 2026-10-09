import { describe, expect, it } from 'vitest'
import {
  indexOfServiceNo,
  pagerPositionFromScroll,
  positionFromRealIndex,
  realIndexFromPosition,
  scrollLeftForPosition,
  shortestCircularDelta,
  wrapTargetPosition,
} from '../src/lib/pager'

describe('carousel position <-> scroll offset', () => {
  it('maps a scroll offset to the nearest position', () => {
    expect(pagerPositionFromScroll(0, 100, 5)).toBe(0)
    expect(pagerPositionFromScroll(100, 100, 5)).toBe(1)
    expect(pagerPositionFromScroll(149, 100, 5)).toBe(1)
    expect(pagerPositionFromScroll(151, 100, 5)).toBe(2)
  })

  it('clamps to the ends of the track', () => {
    expect(pagerPositionFromScroll(-50, 100, 5)).toBe(0)
    expect(pagerPositionFromScroll(9999, 100, 5)).toBe(4)
  })

  it('is safe before layout and with no cards', () => {
    expect(pagerPositionFromScroll(120, 0, 5)).toBe(0)
    expect(pagerPositionFromScroll(120, -1, 5)).toBe(0)
    expect(pagerPositionFromScroll(120, 100, 0)).toBe(0)
  })

  it('round-trips every position through its scroll offset', () => {
    for (let p = 0; p < 5; p++) {
      expect(pagerPositionFromScroll(scrollLeftForPosition(p, 120), 120, 5)).toBe(p)
    }
  })
})

describe('virtual positions and the real service ring', () => {
  it('maps the clone and real positions onto real indices', () => {
    // 0 clones the last service, 1..n are real, n + 1 clones the first.
    expect(realIndexFromPosition(0, 4)).toBe(3)
    expect(realIndexFromPosition(1, 4)).toBe(0)
    expect(realIndexFromPosition(4, 4)).toBe(3)
    expect(realIndexFromPosition(5, 4)).toBe(0)
  })

  it('round-trips a real index through its uncloned position', () => {
    for (let i = 0; i < 4; i++) {
      expect(realIndexFromPosition(positionFromRealIndex(i), 4)).toBe(i)
    }
  })

  it('degrades to index 0 with no services', () => {
    expect(realIndexFromPosition(0, 0)).toBe(0)
    expect(realIndexFromPosition(7, 0)).toBe(0)
  })
})

describe('wrap targets', () => {
  it('jumps from a cloned card to its real twin', () => {
    expect(wrapTargetPosition(0, 5)).toBe(5) // clone of the last -> the real last
    expect(wrapTargetPosition(6, 5)).toBe(1) // clone of the first -> the real first
  })

  it('does not move when settled on a real card', () => {
    for (let p = 1; p <= 5; p++) {
      expect(wrapTargetPosition(p, 5)).toBeNull()
    }
  })

  it('never wraps when no seam is rendered', () => {
    expect(wrapTargetPosition(0, 1)).toBeNull()
    expect(wrapTargetPosition(2, 1)).toBeNull()
    expect(wrapTargetPosition(0, 0)).toBeNull()
  })
})

describe('shortestCircularDelta', () => {
  it('takes the short way around the ring', () => {
    expect(shortestCircularDelta(0, 1, 5)).toBe(-1)
    expect(shortestCircularDelta(4, 0, 5)).toBe(-1) // last sits one behind the first
    expect(shortestCircularDelta(0, 4, 5)).toBe(1)
    expect(shortestCircularDelta(2, 2, 5)).toBe(0)
  })

  it('follows a fractional centre so the taper can track a drag', () => {
    expect(shortestCircularDelta(1, 0.4, 5)).toBeCloseTo(0.6)
    expect(shortestCircularDelta(0, 0.4, 5)).toBeCloseTo(-0.4)
  })

  it('is safe with no ring', () => {
    expect(shortestCircularDelta(0, 1, 0)).toBe(0)
  })
})

describe('indexOfServiceNo', () => {
  const list = [{ no: '2' }, { no: '12' }, { no: '147' }]

  it('finds a service by its number', () => {
    expect(indexOfServiceNo(list, '12')).toBe(1)
  })

  it('falls back to the first service when it is gone or unknown', () => {
    expect(indexOfServiceNo(list, '999')).toBe(0)
    expect(indexOfServiceNo(list, null)).toBe(0)
    expect(indexOfServiceNo([], '2')).toBe(0)
  })
})
