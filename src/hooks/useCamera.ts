import { useCallback, useEffect, useRef, useState } from 'react'

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const tokenRef = useRef(0)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    tokenRef.current += 1
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setActive(false)
  }, [])

  const start = useCallback(async () => {
    const token = tokenRef.current + 1
    tokenRef.current = token
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported on this device or browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
        },
        audio: false,
      })
      if (token !== tokenRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setActive(true)
    } catch {
      setError(
        'Could not access the camera. You can enter the bus stop code manually instead.',
      )
    }
  }, [])

  useEffect(() => () => stop(), [stop])

  return { videoRef, active, error, start, stop }
}
