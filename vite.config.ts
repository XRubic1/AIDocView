import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Bind IPv4 so http://localhost:3000 and http://127.0.0.1:3000 both work
    // (Node otherwise listens on ::1 only, and browsers hang on 127.0.0.1).
    host: '127.0.0.1',
    strictPort: true,
    open: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // Keep React + Recharts/d3 in one chunk. Splitting them breaks production
          // with: Cannot read properties of undefined (reading 'forwardRef').
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/recharts') ||
            id.includes('node_modules/d3-') ||
            id.includes('/d3/')
          ) {
            return 'vendor-react'
          }
          if (
            id.includes('jspdf') ||
            id.includes('pdfjs') ||
            id.includes('html2canvas') ||
            id.includes('xlsx')
          ) {
            return 'vendor-docs'
          }
          if (id.includes('@supabase')) {
            return 'vendor-supabase'
          }
          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }
        },
      },
    },
  },
})
