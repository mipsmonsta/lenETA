import type { FavoriteStop, Stop } from '../types'

const KEY = 'lenETA:favorites'

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
