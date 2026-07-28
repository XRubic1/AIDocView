import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'

/** Renames dist/waitlist.html → dist/index.html for Vercel static hosting. */
function renameWaitlistHtmlToIndex() {
  return {
    name: 'rename-waitlist-html-to-index',
    closeBundle() {
      const from = resolve(__dirname, 'dist/waitlist.html')
      const to = resolve(__dirname, 'dist/index.html')
      if (existsSync(from)) {
        renameSync(from, to)
      }
    },
  }
}

/**
 * Waitlist-only Vite build for Vercel.
 * Usage: npm run build:waitlist
 */
export default defineConfig({
  plugins: [react(), renameWaitlistHtmlToIndex()],
  define: {
    'import.meta.env.VITE_MARKETING_ONLY': JSON.stringify('true'),
  },
  server: {
    port: 3001,
    open: '/waitlist.html',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'waitlist.html'),
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react'
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
