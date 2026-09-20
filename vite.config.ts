import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose VITE_* plus the safe public Supabase keys (not SERVICE_ROLE).
  envPrefix: ['VITE_', 'SUPABASE_URL', 'SUPABASE_ANON', 'SUPABASE_PUBLISHABLE'],
  server: {
    port: 3000,
    // Bind IPv4 so http://localhost:3000 and http://127.0.0.1:3000 both work
    // (Node otherwise listens on ::1 only, and browsers hang on 127.0.0.1).
    host: '127.0.0.1',
    strictPort: true,
    open: true,
  },
  // Do not manually split React / Recharts — that caused production boot to hang with:
  // Cannot read properties of undefined (reading 'forwardRef') in vendor-charts-*.js
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
