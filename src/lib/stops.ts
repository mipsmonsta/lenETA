import type { Stop } from '../types'

let cache: Map<string, Stop> | null = null

type StopsFile = {
  updatedAt: string
  stops: Record<string, [number, number, string, string]>
}

export async function loadStops(): Promise<Map<string, Stop>> {
  if (cache) return cache
  const res = await fetch(`${import.meta.env.BASE_URL}stops.json`)
  if (!res.ok) {
    throw new Error('Failed to load bus stop data')
  }
  const data = (await res.json()) as StopsFile
  const map = new Map<string, Stop>()
  for (const [code, [lng, lat, name, road]] of Object.entries(data.stops)) {
    map.set(code, { code, name, road, lat, lng })
  }
  cache = map
  return map
}

export async function getStop(code: string): Promise<Stop | null> {
  const map = await loadStops()
  return map.get(code) ?? null
}

export async function isValidStop(code: string): Promise<boolean> {
  const map = await loadStops()
  return map.has(code)
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function findNearby(
  lat: number,
  lng: number,
  radiusMeters = 300,
): Promise<Stop[]> {
  const map = await loadStops()
  const out: Array<Stop & { dist: number }> = []
  for (const stop of map.values()) {
    const dist = distanceMeters(lat, lng, stop.lat, stop.lng)
    if (dist <= radiusMeters) out.push({ ...stop, dist })
  }
  out.sort((a, b) => a.dist - b.dist)
  return out.map((s) => ({
    code: s.code,
    name: s.name,
    road: s.road,
    lat: s.lat,
    lng: s.lng,
  }))
}
