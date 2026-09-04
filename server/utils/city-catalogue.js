import knex from './connection.js'
import { buildCityCatalogue } from '#shared/utils/city-catalogue.js'

let cached
let expiresAt = 0
let pending

export async function getCityCatalogue() {
  if (cached && Date.now() < expiresAt) return cached
  if (!pending) {
    pending = knex('city').select('id', 'english_name', 'country_code')
      .then(rows => {
        cached = buildCityCatalogue(rows)
        expiresAt = Date.now() + 5 * 60 * 1000
        return cached
      }).finally(() => { pending = undefined })
  }
  return pending
}
