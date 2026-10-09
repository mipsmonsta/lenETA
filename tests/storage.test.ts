import { describe, expect, it } from 'vitest'
import {
  getOcrDebugChoice,
  getServiceLayoutChoice,
  isScanGuideDone,
  markScanGuideDone,
  setOcrDebugChoice,
  setServiceLayoutChoice,
} from '../src/lib/storage'

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

describe('OCR debug preference persistence', () => {
  it('reports no choice when nothing is stored', () => {
    stubStorage({})
    expect(getOcrDebugChoice()).toBeNull()
  })

  it('reads a stored on/off choice', () => {
    stubStorage({ 'lenETA:ocrDebug': '1' })
    expect(getOcrDebugChoice()).toBe(true)
    stubStorage({ 'lenETA:ocrDebug': '0' })
    expect(getOcrDebugChoice()).toBe(false)
  })

  it('treats an unrecognised value as no choice', () => {
    stubStorage({ 'lenETA:ocrDebug': 'yes' })
    expect(getOcrDebugChoice()).toBeNull()
  })

  it('persists the choice', () => {
    const store: Record<string, string> = {}
    stubStorage(store)
    setOcrDebugChoice(true)
    expect(store['lenETA:ocrDebug']).toBe('1')
    setOcrDebugChoice(false)
    expect(store['lenETA:ocrDebug']).toBe('0')
  })

  it('degrades safely when storage is unavailable', () => {
    stubStorage({}, true)
    expect(() => setOcrDebugChoice(true)).not.toThrow()
    stubStorage({})
    delete (globalThis as { localStorage?: unknown }).localStorage
    expect(getOcrDebugChoice()).toBeNull()
    expect(() => setOcrDebugChoice(false)).not.toThrow()
  })
})

describe('service layout persistence', () => {
  it('reports no choice when nothing is stored', () => {
    stubStorage({})
    expect(getServiceLayoutChoice()).toBeNull()
  })

  it('reads a stored layout', () => {
    stubStorage({ 'lenETA:serviceLayout': 'list' })
    expect(getServiceLayoutChoice()).toBe('list')
    stubStorage({ 'lenETA:serviceLayout': 'carousel' })
    expect(getServiceLayoutChoice()).toBe('carousel')
  })

  it('treats an unrecognised value as no choice', () => {
    stubStorage({ 'lenETA:serviceLayout': 'grid' })
    expect(getServiceLayoutChoice()).toBeNull()
    stubStorage({ 'lenETA:serviceLayout': '' })
    expect(getServiceLayoutChoice()).toBeNull()
  })

  it('persists the layout', () => {
    const store: Record<string, string> = {}
    stubStorage(store)
    setServiceLayoutChoice('list')
    expect(store['lenETA:serviceLayout']).toBe('list')
    setServiceLayoutChoice('carousel')
    expect(store['lenETA:serviceLayout']).toBe('carousel')
  })

  it('degrades safely when storage is unavailable', () => {
    stubStorage({}, true)
    expect(() => setServiceLayoutChoice('list')).not.toThrow()
    stubStorage({})
    delete (globalThis as { localStorage?: unknown }).localStorage
    expect(getServiceLayoutChoice()).toBeNull()
    expect(() => setServiceLayoutChoice('list')).not.toThrow()
  })
})
