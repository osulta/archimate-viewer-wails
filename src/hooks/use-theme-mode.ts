import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_THEME_MODE,
  getSystemPrefersDark,
  loadStoredThemeMode,
  resolveTheme,
  saveThemeMode,
  type ResolvedTheme,
  type ThemeMode,
} from '../lib/ui/theme-mode'

export interface ThemeModeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  resolvedTheme: ResolvedTheme
  isDark: boolean
}

export function useThemeMode(): ThemeModeState {
  const [mode, setModeState] = useState<ThemeMode>(() => loadStoredThemeMode())
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => getSystemPrefersDark())

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }
    setSystemPrefersDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode)
    saveThemeMode(nextMode)
  }, [])

  const resolvedTheme = useMemo(
    () => resolveTheme(mode, systemPrefersDark),
    [mode, systemPrefersDark],
  )

  return {
    mode,
    setMode,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
  }
}

export { DEFAULT_THEME_MODE }
