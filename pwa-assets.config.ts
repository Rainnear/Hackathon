import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Maskable and Apple icons are padded with the brand green so the rounded logo sits on a solid tile.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0E6B57' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0E6B57' } },
  },
  images: ['public/logo.svg'],
})
