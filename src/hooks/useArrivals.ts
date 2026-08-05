import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchArrivals } from '../lib/api'
import type { ArriveLahResponse } from '../types'

export function useArrivals(stopCode: string | null, intervalMs = 30000) {
  const [data, setData] = useState<ArriveLahResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const codeRef = useRef(stopCode)
  codeRef.current = stopCode

  const load = useCallback(async () => {
    const code = codeRef.current
    if (!code) return
    setLoading(true)
    setError(null)
    try {
      const d = await fetchArrivals(code)
      setData(d)
      setUpdatedAt(Date.now())
    } catch {
      setError('Could not fetch arrivals. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    if (intervalMs > 0) {
      timerRef.current = window.setInterval(load, intervalMs)
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [load, intervalMs])

  return { data, loading, error, updatedAt, refresh: load }
}
