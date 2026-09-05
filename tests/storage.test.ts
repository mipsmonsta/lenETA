import { describe, expect, it } from 'vitest'
import { isScanGuideDone, markScanGuideDone } from '../src/lib/storage'

function stubStorage(store: Record<string, string>, throwOnSet = false) {
  const mem = store
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k in mem ? mem[k] : null),
    setItem: (k: string, v: string) => {
      if (throwOnSet) throw new Error('quota')
      mem[k] = String(v)
    },
    removeItem: (k: string) => {
      delete mem[k]
    },
    clear: () => {
      for (const k of Object.keys(mem)) delete mem[k]
    },
  } as Storage
}

describe('first-time scan guide persistence', () => {
  it('defaults to not done when nothing is stored', () => {
    stubStorage({})
    expect(isScanGuideDone()).toBe(false)
  })

  it('becomes done after markScanGuideDone', () => {
    const store: Record<string, string> = {}
    stubStorage(store)
    expect(isScanGuideDone()).toBe(false)
    markScanGuideDone()
    expect(isScanGuideDone()).toBe(true)
    expect(store['lenETA:scanGuideDone']).toBe('1')
  })

  it('stays done across separate reads', () => {
    stubStorage({ 'lenETA:scanGuideDone': '1' })
    expect(isScanGuideDone()).toBe(true)
  })

  it('degrades safely when storage is unavailable', () => {
    stubStorage({}, true)
    expect(() => markScanGuideDone()).not.toThrow()
    stubStorage({})
    delete (globalThis as { localStorage?: unknown }).localStorage
    expect(isScanGuideDone()).toBe(false)
    expect(() => markScanGuideDone()).not.toThrow()
  })
})
