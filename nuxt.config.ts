import { classicalBotSite } from './site.config.js'
export default defineNuxtConfig({
  extends: ['./layers/concerts'],
  css: ['~/assets/css/composers.css'],
  devtools: { enabled: true },
  modules: ['@nuxt/content', '@nuxtjs/sitemap'],
  site: { url: classicalBotSite.origin },
  sitemap: {
    excludeAppSources: true,
    cacheMaxAgeSeconds: 3600,
    autoLastmod: false,
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
