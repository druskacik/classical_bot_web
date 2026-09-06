import knex from '#layers/concerts/server/utils/connection.js'
import { getCityCatalogue } from '#layers/concerts/server/utils/city-catalogue.js'
import { applyPublicConcertScope } from '#layers/concerts/server/utils/public-concerts.js'
import { buildSitemapInventory } from '#shared/utils/sitemap-inventory.js'
import { getComposerDirectory } from './composers.js'

export async function getSitemapInventory() {
  const [catalogue, counts, composers] = await Promise.all([
    getCityCatalogue(),
    applyPublicConcertScope(knex('classical_concert as cc'))
      .select('cc.country_code_resolved', 'cc.city_id')
      .count('* as count')
      .groupBy('cc.country_code_resolved', 'cc.city_id'),
    getComposerDirectory(),
  ])
  return buildSitemapInventory(catalogue, counts, composers)
}
