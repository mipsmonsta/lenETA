import { describe, expect, it } from 'vitest'
import { resolveOcrDebug } from '../src/lib/debug'

describe('OCR debug default resolution', () => {
  it('falls back to the build default when the user has not chosen', () => {
    expect(resolveOcrDebug(null, true)).toBe(true)
    expect(resolveOcrDebug(null, false)).toBe(false)
  })

  it('lets an explicit user choice win over the build default', () => {
    expect(resolveOcrDebug(true, false)).toBe(true)
    expect(resolveOcrDebug(false, true)).toBe(false)
  })
})
