import { getSitemapInventory } from '../utils/sitemap-inventory.js'
import { queryCollection } from '@nuxt/content/server'

export default defineNitroPlugin((nitroApp) => {
  // Populate inside the module's resolved-URL cache (XML is cached separately).
  // The configured interval is not a strict freshness bound. HTTP sources have their own
  // cache and swallow failures; throwing here preserves a cached good inventory
  // or returns an error, never a successful sitemap missing all dynamic pages.
  nitroApp.hooks.hook('sitemap:input', async (ctx) => {
    try {
      const [inventory, posts] = await Promise.all([
        getSitemapInventory(),
        queryCollection(ctx.event, 'blog').select('path').all(),
      ])
      ctx.urls = [...inventory, ...posts.map(post => ({ loc: post.path }))]
    } catch {
      throw createError({ statusCode: 503, statusMessage: 'Sitemap temporarily unavailable' })
    }
  })
})
