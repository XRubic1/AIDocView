import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import WaitlistApp from './WaitlistApp'
import './index.css'

/** Marketing-only bootstrap — no Auth / Supabase gate. */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WaitlistApp />
  </StrictMode>
)
