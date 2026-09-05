import { describe, expect, it } from 'vitest'
import { selectCodeCandidate, type OcrLine } from '../src/lib/ocrEngine'

const V = { width: 400, height: 120 }

function w(text: string, conf: number, x0: number, y0: number, x1: number, y1: number) {
  return { text, confidence: conf, bbox: { x0, y0, x1, y1 } }
}

function line(text: string, conf: number, y0: number, h: number, words: OcrLine['words']) {
  const bbox = {
    x0: Math.min(...words.map((ww) => ww.bbox.x0)),
    y0: Math.min(...words.map((ww) => ww.bbox.y0)),
    x1: Math.max(...words.map((ww) => ww.bbox.x1)),
    y1: Math.max(...words.map((ww) => ww.bbox.y1)),
  }
  return { text, confidence: conf, bbox, words }
}

describe('selectCodeCandidate (code + description text in the frame)', () => {
  it('picks the 5-digit word from a crop that also has a description row below', () => {
    const lines: OcrLine[] = [
      // Code row (tall, near the box centre).
      line('04229', 96, 40, 40, [w('04229', 96, 150, 40, 230, 80)]),
      // Description row below: letters + bus-service numbers.
      line('196 96 3 Clementi', 80, 90, 18, [
        w('196', 90, 130, 92, 170, 106),
        w('96', 88, 176, 92, 200, 106),
        w('3', 85, 206, 92, 218, 106),
        w('Clementi', 75, 224, 92, 310, 106),
      ]),
    ]
    const c = selectCodeCandidate(lines, V)
    expect(c?.code).toBe('04229')
    expect(c!.confidence).toBeGreaterThan(0.9)
  })

  it('tolerates punctuation inside the token', () => {
    const lines: OcrLine[] = [
      line('04229.', 95, 40, 36, [w('04229.', 95, 120, 40, 210, 76)]),
    ]
    expect(selectCodeCandidate(lines, V)?.code).toBe('04229')
  })

  it('ignores letters-only text and short numbers', () => {
    const lines: OcrLine[] = [
      line('BUS STOP', 80, 40, 20, [w('BUS', 80, 120, 40, 180, 60), w('STOP', 80, 186, 40, 240, 60)]),
      line('3 96 196', 85, 70, 16, [w('3', 85, 150, 70, 160, 86), w('96', 85, 170, 70, 200, 86), w('196', 85, 206, 70, 250, 86)]),
    ]
    expect(selectCodeCandidate(lines, V)).toBeNull()
  })

  it('prefers the taller, more central candidate on ties', () => {
    const lines: OcrLine[] = [
      // Description-ish 5-digit number low down and short.
      line('12345', 93, 96, 12, [w('12345', 93, 150, 96, 240, 108)]),
      // The real code: tall and central.
      line('04229', 92, 44, 40, [w('04229', 92, 150, 44, 240, 84)]),
    ]
    expect(selectCodeCandidate(lines, V)?.code).toBe('04229')
  })
})
