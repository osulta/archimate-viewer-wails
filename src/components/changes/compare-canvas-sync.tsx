import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

interface CompareCanvasSyncValue {
  zoom: number
  setZoom: (nextZoom: number) => void
  registerScrollElement: (element: HTMLElement | null) => (() => void) | undefined
}

const CompareCanvasSyncContext = createContext<CompareCanvasSyncValue | null>(null)

interface CompareCanvasSyncProviderProps {
  resetKey: string
  children: ReactNode
}

export function CompareCanvasSyncProvider(props: CompareCanvasSyncProviderProps) {
  const { resetKey, children } = props
  const [zoom, setZoomState] = useState(1)
  const scrollElementsRef = useRef<Set<HTMLElement>>(new Set())
  const isSyncingScrollRef = useRef(false)

  const setZoom = useCallback((nextZoom: number) => {
    const clamped = Math.max(0.3, Math.min(3, nextZoom))
    setZoomState(clamped)
  }, [])

  useEffect(() => {
    setZoomState(1)
    isSyncingScrollRef.current = true
    scrollElementsRef.current.forEach((el) => {
      el.scrollLeft = 0
      el.scrollTop = 0
    })
    isSyncingScrollRef.current = false
  }, [resetKey])

  const registerScrollElement = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return undefined
    }

    const existing = scrollElementsRef.current
    if (existing.size > 0) {
      const [first] = existing
      isSyncingScrollRef.current = true
      element.scrollLeft = first.scrollLeft
      element.scrollTop = first.scrollTop
      isSyncingScrollRef.current = false
    }
    existing.add(element)

    const handleScroll = () => {
      if (isSyncingScrollRef.current) {
        return
      }
      isSyncingScrollRef.current = true
      const { scrollLeft, scrollTop } = element
      scrollElementsRef.current.forEach((el) => {
        if (el !== element) {
          el.scrollLeft = scrollLeft
          el.scrollTop = scrollTop
        }
      })
      isSyncingScrollRef.current = false
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      element.removeEventListener('scroll', handleScroll)
      scrollElementsRef.current.delete(element)
    }
  }, [])

  const value = useMemo(
    () => ({ zoom, setZoom, registerScrollElement }),
    [zoom, setZoom, registerScrollElement],
  )

  return (
    <CompareCanvasSyncContext.Provider value={value}>{children}</CompareCanvasSyncContext.Provider>
  )
}

export function useCompareCanvasSync() {
  return useContext(CompareCanvasSyncContext)
}
