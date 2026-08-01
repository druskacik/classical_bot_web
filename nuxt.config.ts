// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'light'
  },
  ui: {
    theme: {
      colors: [
        'primary',
        'secondary',  
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
    }
  },
  app: {
    head: {
      script: [
        {
          src: 'https://umami.cr.bswatcher.com/script.js',
          'data-website-id': 'f1439093-e84e-4c8b-92d8-0db2e3d7f2e4',
          async: true,
          defer: true,
        }
      ]
    }
  }
})
