import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { isSupabaseConfigured } from './lib/supabase'
import { hydrateAllStores } from './services/supabase/hydrateStores'

async function bootstrap() {
  if (isSupabaseConfigured()) {
    await hydrateAllStores()
  }

  bootstrapTheme()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

function bootstrapTheme() {  try {
    const stored = localStorage.getItem('credyx-theme')
    const resolved =
      stored === 'dark'
        ? 'dark'
        : stored === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : 'light'
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.style.colorScheme = resolved
  } catch {
    document.documentElement.setAttribute('data-theme', 'light')
  }
}

void bootstrap()
