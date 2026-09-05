import { describe, expect, it } from 'vitest'
import { zoomRectAbout } from '../src/lib/geometry'

describe('zoomRectAbout (camera zoom → OCR crop rect)', () => {
  it('is the identity at zoom = 1', () => {
    const box = { x: 10, y: 20, width: 300, height: 40 }
    expect(zoomRectAbout(box, { x: 100, y: 40 }, 1)).toEqual(box)
  })

  it('keeps the anchor fixed and halves the box at 2x', () => {
    const box = { x: 10, y: 20, width: 300, height: 40 }
    const anchor = { x: 160, y: 40 } // box centre
    const r = zoomRectAbout(box, anchor, 2)
    expect(r.width).toBe(150)
    expect(r.height).toBe(20)
    // The centre of the zoomed rect is still the anchor.
    expect(r.x + r.width / 2).toBeCloseTo(anchor.x)
    expect(r.y + r.height / 2).toBeCloseTo(anchor.y)
  })

  it('collapses the box toward an off-centre anchor', () => {
    const box = { x: 100, y: 100, width: 100, height: 100 }
    // Anchor at the top-left corner of the box: zooming shrinks it in place.
    const r = zoomRectAbout(box, { x: 100, y: 100 }, 2)
    expect(r.x).toBe(100)
    expect(r.y).toBe(100)
    expect(r.width).toBe(50)
    expect(r.height).toBe(50)
  })

  it('stays finite for absurd zoom values', () => {
    const box = { x: 0, y: 0, width: 100, height: 20 }
    const r = zoomRectAbout(box, { x: 50, y: 10 }, 0)
    expect(Number.isFinite(r.x)).toBe(true)
    expect(Number.isFinite(r.width)).toBe(true)
    expect(r.width).toBeGreaterThan(0)
  })
})
