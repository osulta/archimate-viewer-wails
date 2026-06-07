import { useCallback, useEffect, useState } from 'react'

export interface WorkspaceLayoutState {
  canvasFocusMode: boolean
  sidebarCollapsed: boolean
  gitOpen: boolean
  palettesOpen: boolean
  propertiesOpen: boolean
  toggleCanvasFocusMode: () => void
  toggleSidebarCollapsed: () => void
  toggleGitOpen: () => void
  togglePalettesOpen: () => void
  togglePropertiesOpen: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setGitOpen: (open: boolean) => void
  setPalettesOpen: (open: boolean) => void
  setPropertiesOpen: (open: boolean) => void
}

export function useWorkspaceLayout(): WorkspaceLayoutState {
  const [canvasFocusMode, setCanvasFocusMode] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  const [palettesOpen, setPalettesOpen] = useState(true)
  const [propertiesOpen, setPropertiesOpen] = useState(true)

  const toggleCanvasFocusMode = useCallback(() => {
    setCanvasFocusMode((value) => !value)
  }, [])

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((value) => !value)
  }, [])

  const toggleGitOpen = useCallback(() => {
    setGitOpen((value) => !value)
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
    sidebarCollapsed,
    gitOpen,
    palettesOpen,
    propertiesOpen,
    toggleCanvasFocusMode,
    toggleSidebarCollapsed,
    toggleGitOpen,
    togglePalettesOpen,
    togglePropertiesOpen,
    setSidebarCollapsed,
    setGitOpen,
    setPalettesOpen,
    setPropertiesOpen,
  }
}
