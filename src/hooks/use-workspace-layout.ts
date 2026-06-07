import { useCallback, useEffect, useState } from 'react'

export interface WorkspaceLayoutState {
  canvasFocusMode: boolean
  palettesOpen: boolean
  propertiesOpen: boolean
  toggleCanvasFocusMode: () => void
  togglePalettesOpen: () => void
  togglePropertiesOpen: () => void
  setPalettesOpen: (open: boolean) => void
  setPropertiesOpen: (open: boolean) => void
}

export function useWorkspaceLayout(): WorkspaceLayoutState {
  const [canvasFocusMode, setCanvasFocusMode] = useState(false)
  const [palettesOpen, setPalettesOpen] = useState(true)
  const [propertiesOpen, setPropertiesOpen] = useState(true)

  const toggleCanvasFocusMode = useCallback(() => {
    setCanvasFocusMode((value) => !value)
  }, [])

  const togglePalettesOpen = useCallback(() => {
    setPalettesOpen((value) => !value)
  }, [])

  const togglePropertiesOpen = useCallback(() => {
    setPropertiesOpen((value) => !value)
  }, [])

  useEffect(() => {
    if (!canvasFocusMode) {
      return undefined
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCanvasFocusMode(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canvasFocusMode])

  return {
    canvasFocusMode,
    palettesOpen,
    propertiesOpen,
    toggleCanvasFocusMode,
    togglePalettesOpen,
    togglePropertiesOpen,
    setPalettesOpen,
    setPropertiesOpen,
  }
}
