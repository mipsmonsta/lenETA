import { describe, expect, it } from 'vitest'
import { extractCode } from '../src/lib/ocrEngine'

describe('extractCode (OCR output → 5-digit code)', () => {
  it('keeps a clean 5-digit reading', () => {
    expect(extractCode('04229')).toBe('04229')
    expect(extractCode('12345')).toBe('12345')
  })

  it('strips surrounding noise but keeps exactly 5 digits', () => {
    // Bus-stop plaques often carry extra text ("STOP", arrow glyphs) around
    // the number. Tesseract can merge that into one line.
    expect(extractCode('04229\n')).toBe('04229')
    expect(extractCode('Code 04229')).toBe('04229')
    expect(extractCode('42029A')).toBe('42029')
    expect(extractCode('AB1CD23EF45G')).toBe('12345')
  })

  it('rejects anything that is not exactly five digits', () => {
    expect(extractCode('')).toBeNull()
    expect(extractCode('1234')).toBeNull()
    expect(extractCode('123456')).toBeNull()
    expect(extractCode('12a34')).toBeNull() // only 4 digits after stripping
    expect(extractCode('Lorem ipsum dolor sit')).toBeNull()
    expect(extractCode(undefined as unknown as string)).toBeNull()
    expect(extractCode(null as unknown as string)).toBeNull()
  })
})
