import { useEffect, useState } from 'react'

/**
 * Defers mounting a heavy tab panel so a loader can paint first,
 * then keeps the loader until after the panel's first paint.
 */
export function useDeferredTabMount(isActive: boolean): {
  shouldMount: boolean
  isReady: boolean
} {
  const [shouldMount, setShouldMount] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!isActive) {
      setShouldMount(false)
      setIsReady(false)
      return
    }

    setIsReady(false)
    setShouldMount(false)
    const frame = window.requestAnimationFrame(() => {
      setShouldMount(true)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [isActive])

  useEffect(() => {
    if (!shouldMount) {
      return
    }
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setIsReady(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [shouldMount])

  return { shouldMount, isReady }
}
