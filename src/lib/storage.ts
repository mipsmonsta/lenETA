import type { FavoriteStop, Stop } from '../types'

const KEY = 'lenETA:favorites'
const GUIDE_KEY = 'lenETA:scanGuideDone'

export function getFavorites(): FavoriteStop[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as FavoriteStop[]) : []
  } catch {
    return []
  }
}

function persist(list: FavoriteStop[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // storage unavailable; ignore
  }
}

export function addFavorite(list: FavoriteStop[], stop: Stop): FavoriteStop[] {
  const next = list.filter((f) => f.code !== stop.code)
  const updated = [
    { code: stop.code, name: stop.name, road: stop.road },
    ...next,
  ]
  persist(updated)
  return updated
}

export function removeFavorite(list: FavoriteStop[], code: string): FavoriteStop[] {
  const updated = list.filter((f) => f.code !== code)
  persist(updated)
  return updated
}

export function isFavorite(list: FavoriteStop[], code: string): boolean {
  return list.some((f) => f.code === code)
}

/**
 * Whether the first-time "how to scan" guide has been completed (either
 * dismissed with "Got it" or auto-completed by a first successful scan).
 */
export function isScanGuideDone(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function markScanGuideDone(): void {
  try {
    localStorage.setItem(GUIDE_KEY, '1')
  } catch {
    // storage unavailable; ignore
  }
}
