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
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react'
            }
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts'
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
          }
        },
      },
    },
  },
})
