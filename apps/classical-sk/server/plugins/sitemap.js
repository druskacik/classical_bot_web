import knex from '#layers/concerts/server/utils/connection.js'
import { getCityCatalogue } from '#layers/concerts/server/utils/city-catalogue.js'
import { applyPublicConcertScope } from '#layers/concerts/server/utils/public-concerts.js'
import { buildSlovakSitemapInventory } from '#shared/utils/sitemap-inventory.js'
export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('sitemap:input', async ctx => {
    try {
      const [catalogue, counts] = await Promise.all([
        getCityCatalogue(),
        applyPublicConcertScope(knex('classical_concert as cc'), 'SK').select('cc.country_code_resolved', 'cc.city_id').count('* as count').groupBy('cc.country_code_resolved', 'cc.city_id'),
      ])
      ctx.urls = buildSlovakSitemapInventory(catalogue, counts)
    } catch {
      throw createError({ statusCode: 503, statusMessage: 'Sitemap temporarily unavailable' })
    }
  })
})
