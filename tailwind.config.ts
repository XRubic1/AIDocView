import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Credyx A/R Solutions brand palette (public marketing pages)
      colors: {
        credyx: {
          navy: '#113543',
          'navy-dark': '#0a2529',
          gold: '#C2A558',
          'gold-dark': '#b89547',
          slate: '#819291',
          surface: '#F5F5F5',
        },
      },
    },
  },
  plugins: [],
}
export default config
