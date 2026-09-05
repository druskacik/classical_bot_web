import knex from './connection.js'
import { concertSite } from '#concert-site'
import { buildLocalCityCatalogue, addUnresolvedLocalCities } from '../../shared/utils/local-city-catalogue.js'
import { buildCityCatalogue } from '../../shared/utils/city-catalogue.js'

let cached
let expiresAt = 0
let pending

export async function getCityCatalogue() {
  if (cached && Date.now() < expiresAt) return cached
  if (!pending) {
    pending = knex('city').select('id', 'english_name', 'local_name', 'country_code')
      .modify(query => { if (concertSite.country) query.where('country_code', concertSite.country) })
      .then(async rows => {
        cached = concertSite.cityRoutes === 'local' ? buildLocalCityCatalogue(rows, concertSite.country) : buildCityCatalogue(rows)
        if (concertSite.cityRoutes === 'local') {
          const unresolved = await knex('classical_concert').distinct('city_raw')
            .where('country_code_resolved', concertSite.country).whereNull('city_id').whereNotNull('city_raw')
          addUnresolvedLocalCities(cached, unresolved.map(row => row.city_raw), concertSite.country)
        }
        expiresAt = Date.now() + 5 * 60 * 1000
        return cached
      }).finally(() => { pending = undefined })
  }
  return pending
}
