import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './app-theme.css'
import App from './App'
import { ThemeProvider } from './components/theme-provider'
import { setApiBase } from './lib/api-base'
import { GetAPIBaseURL } from '../wailsjs/go/main/App'

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
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>,
  )
}

void bootstrap()
