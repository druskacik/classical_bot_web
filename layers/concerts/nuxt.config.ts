import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  $meta: { name: 'concerts' },
  alias: { '#concert-site': fileURLToPath(new URL('./shared/site.js', import.meta.url)) },
  compatibilityDate: '2024-11-01',
  nitro: {
    compressPublicAssets: true,
    // Include layer helpers in both the prerenderer and standalone server bundle.
    externals: { inline: [fileURLToPath(new URL('./', import.meta.url))] },
  },
  modules: ['@nuxt/ui'],
  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],
  ui: {
    colorMode: false,
    theme: {
      colors: [
        'primary',
        'error',
        'red',
        'orange',
        'amber',
        'yellow',
        'lime',
        'green',
        'emerald',
        'teal',
        'cyan',
        'sky',
        'blue',
        'indigo',
        'violet',
        'purple',
        'fuchsia',
        'pink',
        'rose',
      ]
    },
    experimental: {
      componentDetection: true
    }
  },
})
