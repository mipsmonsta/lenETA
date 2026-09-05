import { useCallback, useState } from 'react'
import HomeScreen from './components/HomeScreen'
import KeypadScreen from './components/KeypadScreen'
import ScanScreen from './components/ScanScreen'
import StopResults from './components/StopResults'
import { addFavorite, getFavorites, isFavorite, isScanGuideDone, markScanGuideDone, removeFavorite } from './lib/storage'
import { getStop } from './lib/stops'
import type { FavoriteStop } from './types'

type View =
  | { name: 'home' }
  | { name: 'scan' }
  | { name: 'keypad' }
  | { name: 'results'; code: string }

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const [favorites, setFavorites] = useState<FavoriteStop[]>(() => getFavorites())
  const [guideDone, setGuideDone] = useState<boolean>(() => isScanGuideDone())

  // Completing the guide (or the user's first successful scan) hides the
  // first-time "how to scan" card for good.
  const completeGuide = useCallback(() => {
    setGuideDone(true)
    markScanGuideDone()
  }, [])

  const openStop = useCallback((code: string) => {
    setView({ name: 'results', code })
  }, [])

  const handleDetected = useCallback((code: string) => {
    completeGuide()
    setView({ name: 'results', code })
  }, [completeGuide])

  const handleFavorite = useCallback(
    async (code: string) => {
      if (favorites.some((f) => f.code === code)) {
        setFavorites((prev) => removeFavorite(prev, code))
        return
      }
      const stop = await getStop(code)
      if (stop) {
        setFavorites((prev) => addFavorite(prev, stop))
      }
    },
    [favorites],
  )

  switch (view.name) {
    case 'home':
      return (
        <HomeScreen
          favorites={favorites}
          guideDone={guideDone}
          onGuideDone={completeGuide}
          onOpenStop={openStop}
          onScan={() => setView({ name: 'scan' })}
          onManual={() => setView({ name: 'keypad' })}
          onRemove={(code) => setFavorites((prev) => removeFavorite(prev, code))}
        />
      )
    case 'scan':
      return (
        <ScanScreen
          onDetected={handleDetected}
          onManual={() => setView({ name: 'keypad' })}
          onClose={() => setView({ name: 'home' })}
        />
      )
    case 'keypad':
      return (
        <KeypadScreen
          onSubmit={openStop}
          onClose={() => setView({ name: 'home' })}
        />
      )
    case 'results':
      return (
        <StopResults
          code={view.code}
          onBack={() => setView({ name: 'home' })}
          favorite={isFavorite(favorites, view.code)}
          onToggleFavorite={handleFavorite}
        />
      )
  }
}
