import knex from '#layers/concerts/server/utils/connection.js'
import { getCityCatalogue } from '#layers/concerts/server/utils/city-catalogue.js'
import { applyPublicConcertScope } from '#layers/concerts/server/utils/public-concerts.js'
export default defineEventHandler(async () => {
  const [catalogue, counts] = await Promise.all([
    getCityCatalogue(),
    applyPublicConcertScope(knex('classical_concert as cc'), 'SK').select('cc.city_id', 'cc.city_raw').count('* as count').groupBy('cc.city_id', 'cc.city_raw'),
  ])
  const cities = new Map()
  for (const row of counts) {
    const city = catalogue.byId.get(String(row.city_id)) || catalogue.byPath.get(`/${row.city_raw}`)
    if (!city) continue
    const count = (cities.get(city.path)?.count || 0) + Number(row.count)
    cities.set(city.path, { ...city, count })
  }
  return [...cities.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'sk'))
})
