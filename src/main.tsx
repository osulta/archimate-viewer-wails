import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { setApiBase } from './lib/api-base'
import { GetAPIBaseURL } from '../wailsjs/go/main/App'

async function bootstrap() {
  try {
    const base = await GetAPIBaseURL()
    if (base) {
      setApiBase(base)
    }
  } catch {
    // Browser-only dev (Vite proxy to /api)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
