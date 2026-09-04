import { getSitemapInventory } from '../utils/sitemap-inventory.js'

export default defineNitroPlugin((nitroApp) => {
  // Populate inside the module's resolved-URL cache (XML is cached separately).
  // The configured interval is not a strict freshness bound. HTTP sources have their own
  // cache and swallow failures; throwing here preserves a cached good inventory
  // or returns an error, never a successful sitemap missing all dynamic pages.
  nitroApp.hooks.hook('sitemap:input', async (ctx) => {
    try {
      ctx.urls = await getSitemapInventory()
    } catch {
      throw createError({ statusCode: 503, statusMessage: 'Sitemap temporarily unavailable' })
    }
  })
})
