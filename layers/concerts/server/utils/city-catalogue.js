import knex from './connection.js'
import { concertSite } from '#concert-site'
import { withServingSnapshot } from './serving-catalogue.js'
import { buildLocalCityCatalogue, addUnresolvedLocalCities } from '../../shared/utils/local-city-catalogue.js'
import { buildCityCatalogue } from '../../shared/utils/city-catalogue.js'

// Callers composing a response pass their transaction. In particular unresolved
// Slovak locations must come from the same publication as the response counts.
export async function getCityCatalogue(db) {
  if (!db) return withServingSnapshot(knex, trx => getCityCatalogue(trx))
  const rows = await db('city').select('id', 'english_name', 'local_name', 'country_code')
    .modify(query => { if (concertSite.country) query.where('country_code', concertSite.country) })
  const catalogue = concertSite.cityRoutes === 'local' ? buildLocalCityCatalogue(rows, concertSite.country) : buildCityCatalogue(rows)
  if (concertSite.cityRoutes === 'local') {
    const unresolved = await db('serving.current_concert').distinct('city_raw')
      .where('country_code_resolved', concertSite.country).whereNull('city_id').whereNotNull('city_raw')
    addUnresolvedLocalCities(catalogue, unresolved.map(row => row.city_raw), concertSite.country)
  }
  return catalogue
}
