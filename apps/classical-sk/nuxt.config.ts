import { fileURLToPath } from 'node:url'
import { concertSite } from './site.config.js'

export default defineNuxtConfig({
  extends: ['../../layers/concerts'],
  alias: { '#concert-site': fileURLToPath(new URL('./site.config.js', import.meta.url)) },
  buildDir: fileURLToPath(new URL('./.nuxt', import.meta.url)),
  nitro: { externals: { inline: [fileURLToPath(new URL('./', import.meta.url))] } },
  devtools: { enabled: true },
  modules: ['@nuxt/content', '@nuxtjs/sitemap'],
  site: { url: concertSite.origin },
  sitemap: { excludeAppSources: true, cacheMaxAgeSeconds: 3600, autoLastmod: false },
  app: {
    head: {
      htmlAttrs: { lang: 'sk' },
      meta: [{ name: 'theme-color', content: '#ffffff' }],
      script: [{
        src: 'https://umami.cr.bswatcher.com/script.js',
        'data-website-id': 'f1439093-e84e-4c8b-92d8-0db2e3d7f2e4',
        async: true, defer: true,
      }],
    },
  },
})
