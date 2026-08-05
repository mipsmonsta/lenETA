import { useEffect, useState } from 'react'
import { loadStops } from '../lib/stops'
import type { Stop } from '../types'

export function useStops() {
  const [stops, setStops] = useState<Map<string, Stop> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadStops()
      .then((map) => {
        if (active) setStops(map)
      })
      .catch(() => {
        if (active) setError('Bus stop data is unavailable.')
      })
    return () => {
      active = false
    }
  }, [])

  return { stops, error }
}
