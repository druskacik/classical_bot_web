import knex from '#layers/concerts/server/utils/connection.js'
import { getCityCatalogue } from '#layers/concerts/server/utils/city-catalogue.js'
import { applyPublicConcertScope } from '#layers/concerts/server/utils/public-concerts.js'
import { buildSitemapInventory } from '#shared/utils/sitemap-inventory.js'

export async function getSitemapInventory() {
  const [catalogue, counts] = await Promise.all([
    getCityCatalogue(),
    applyPublicConcertScope(knex('classical_concert as cc'))
      .select('cc.country_code_resolved', 'cc.city_id')
      .count('* as count')
      .groupBy('cc.country_code_resolved', 'cc.city_id'),
  ])
  return buildSitemapInventory(catalogue, counts)
}
