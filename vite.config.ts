import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Ask before swapping to a new version so nobody loses an edit mid-encode.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Sakto: Tanod Incentive Documents',
        short_name: 'Sakto',
        description:
          'Encode barangay tanods, check every requirement, and print the masterlist, payroll and cover sheet for the Province of Iloilo.',
        lang: 'en-PH',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0E5E3B',
        background_color: '#F5F2E8',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fonts are bundled, so the whole app works with no connection after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff2}'],
      },
    }),
  ],
})
