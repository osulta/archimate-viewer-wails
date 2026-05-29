import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import './index.css'
import App from './App'
import { setApiBase } from './lib/api-base'
import { GetAPIBaseURL } from '../wailsjs/go/main/App'

const appTheme = {
  token: {
    colorPrimary: '#1f47bf',
    colorLink: '#1f47bf',
    borderRadius: 8,
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    colorTextBase: '#20345d',
  },
  algorithm: antdTheme.defaultAlgorithm,
} as const

async function bootstrap() {
  try {
    const base = await GetAPIBaseURL()
    if (base) {
      setApiBase(base)
    } else if (window.location.protocol === 'wails:') {
      // Desktop fallback if Wails binding returns empty string.
      setApiBase('http://127.0.0.1:5151')
    }
  } catch {
    // Browser-only dev (Vite proxy to /api); desktop fallback for Wails runtime.
    if (window.location.protocol === 'wails:') {
      setApiBase('http://127.0.0.1:5151')
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ConfigProvider locale={ruRU} theme={appTheme}>
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    </StrictMode>,
  )
}

void bootstrap()
