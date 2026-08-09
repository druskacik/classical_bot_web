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
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
      meta: [
        { name: 'theme-color', content: '#ffffff' },
      ],
      script: [
        {
          src: 'https://umami.cr.bswatcher.com/script.js',
          'data-website-id': '80e40b8a-37ec-46e1-ae9d-3749dc235c46',
          async: true,
          defer: true,
        }
      ]
    }
  }
})
