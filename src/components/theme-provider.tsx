import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import { useThemeMode, type ThemeModeState } from '../hooks/use-theme-mode'

const ThemeModeContext = createContext<ThemeModeState | null>(null)

const APP_FONT_FAMILY = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeMode = useThemeMode()
  const { resolvedTheme, isDark } = themeMode

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  const themeConfig = useMemo(
    () => ({
      cssVar: true,
      token: {
        colorPrimary: '#1f47bf',
        colorLink: '#1f47bf',
        borderRadius: 8,
        fontFamily: APP_FONT_FAMILY,
        ...(isDark ? {} : { colorTextBase: '#20345d' }),
      },
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    }),
    [isDark],
  )

  return (
    <ThemeModeContext.Provider value={themeMode}>
      <ConfigProvider locale={ruRU} theme={themeConfig}>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  )
}

export function useThemeModeContext(): ThemeModeState {
  const context = useContext(ThemeModeContext)
  if (!context) {
    throw new Error('useThemeModeContext must be used within ThemeProvider')
  }
  return context
}
