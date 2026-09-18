import { concertSite } from '#concert-site'
import knex from '../utils/connection.js'
import { applyFilters, parseConcertFilters } from '../utils/concert-filters.js'
import { getAreaCities } from '../utils/area-cities.js'
import { resolveArea } from '../utils/concert-area.js'
import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertFilterCacheInput } from '../utils/data-cache-keys.js'

export default defineEventHandler(async event => {
  const filters = parseConcertFilters(getQuery(event), concertSite.country)
  const cities = await getAreaCities()
  if (filters.area) filters.area = resolveArea(filters.area, cities, concertSite.locale)
  return cachedConcertData('map-cities', concertFilterCacheInput(filters), async () => {
    const rows = await applyFilters(knex('classical_concert as cc')
      .leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), filters)
      .select('cc.city_id').count('* as count').groupBy('cc.city_id')
    const counts = new Map(rows.map(row => [String(row.city_id), Number(row.count)]))
    const items = cities.filter(city => counts.has(String(city.id))).map(city => ({
      id: String(city.id), cityQuery: city.cityQuery, name: concertSite.locale === 'sk-SK' ? city.local_name || city.english_name : city.english_name,
      englishName: city.english_name, localName: city.local_name,
      country: city.country_code, latitude: city.latitude, longitude: city.longitude, count: counts.get(String(city.id)),
    }))
    const total = rows.reduce((sum, row) => sum + Number(row.count), 0)
    const mapped = items.reduce((sum, city) => sum + city.count, 0)
    return { items, total, mapped, unmapped: total - mapped }
  })
})
