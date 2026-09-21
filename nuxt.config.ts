import { classicalBotSite } from './site.config.js'
import { fileURLToPath } from 'node:url'
export default defineNuxtConfig({
  extends: ['./layers/concerts'],
  runtimeConfig: { public: { alertsSignupEnabled: false } },
  nitro: {
    experimental: { tasks: true },
    scheduledTasks: { '*/15 * * * *': ['concert-alerts'] },
    externals: { inline: [
      fileURLToPath(new URL('./site.config.js', import.meta.url)),
      'nitropack/presets/node/runtime/node-server',
    ] },
  },
  $production: {
    nitro: {
      entry: fileURLToPath(new URL('./server/startup.mjs', import.meta.url)),
      hooks: {
        'prerender:config': (config) => { delete config.entry },
        'rollup:before': (_nitro, config) => {
          const output = config.output
          if (!output || Array.isArray(output)) return
          const manualChunks = output.manualChunks
          // Nitro normally groups its runtime into one eagerly loaded chunk.
          // The listener must remain a genuinely deferred import.
          output.manualChunks = (id, meta) => id.endsWith('/presets/node/runtime/node-server.mjs')
            ? 'nitro/listener'
            : typeof manualChunks === 'function' ? manualChunks(id, meta) : undefined
        },
      },
    },
  },
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
