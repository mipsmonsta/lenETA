import { describe, expect, it } from 'vitest'
import { resolveServiceLayout, SERVICE_LAYOUT_DEFAULT } from '../src/lib/layout'

describe('service layout default resolution', () => {
  it('defaults to the carousel', () => {
    expect(SERVICE_LAYOUT_DEFAULT).toBe('carousel')
    expect(resolveServiceLayout(null)).toBe('carousel')
  })

  it('lets an explicit user choice win over the default', () => {
    expect(resolveServiceLayout('list')).toBe('list')
    expect(resolveServiceLayout('carousel')).toBe('carousel')
  })

  it('honours an explicit fallback when there is no choice', () => {
    expect(resolveServiceLayout(null, 'list')).toBe('list')
    expect(resolveServiceLayout('carousel', 'list')).toBe('carousel')
  })
})
