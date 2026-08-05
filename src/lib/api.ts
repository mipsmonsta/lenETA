import type { ArriveLahResponse } from '../types'

const API_BASE = 'https://arrivelah2.busrouter.sg/'

export async function fetchArrivals(stopCode: string): Promise<ArriveLahResponse> {
  const url = `${API_BASE}?id=${encodeURIComponent(stopCode)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Arrival request failed (HTTP ${res.status})`)
  }
  const data = (await res.json()) as ArriveLahResponse
  if (!Array.isArray(data.services)) {
    throw new Error('Unexpected response from arrival API')
  }
  return data
}
