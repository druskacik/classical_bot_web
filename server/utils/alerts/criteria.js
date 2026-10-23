import { concertWorks, concertComposers } from '../../../layers/concerts/server/utils/resolved-concerts.js'
import { buildCityIdentities, resolveCitySelection } from '../../../layers/concerts/shared/utils/city-identity.js'
import { createError } from 'h3'
import { parseConcertFilters, applyFilters } from '../../../layers/concerts/server/utils/concert-filters.js'
import { resolveArea } from '../../../layers/concerts/server/utils/concert-area.js'
const keys = ['country', 'city', 'radius', 'nearCity', 'nearLat', 'nearLng', 'radiusKm', 'dateFrom', 'dateTo', 'composers', 'works']
export async function criteria(db, input, { allowExpired = false, requireFilter = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.bounds) throw createError({ statusCode: 400, statusMessage: 'Remove the map area before creating an alert.' })
  const query = {}
  for (const key of keys) {
    if (input[key] == null || input[key] === '') continue
    if (typeof input[key] !== 'string' || input[key].length > 2000) throw createError({ statusCode: 400, statusMessage: 'Invalid search criteria.' })
    query[key] = input[key]
  }
  // Accept saved alerts from before the shared query syntax changed.
  if (query.nearCity !== undefined && query.city === undefined) query.city = query.nearCity
  if (query.radiusKm !== undefined && query.radius === undefined) query.radius = query.radiusKm
  delete query.nearCity; delete query.radiusKm
  const filters = parseConcertFilters(query)
  if (requireFilter && ![filters.country, filters.city, filters.area, filters.dateFrom, filters.dateTo, filters.composers.length, filters.works.length].some(Boolean)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose at least one filter before saving an alert.' })
  }
  if (!allowExpired && filters.dateTo) {
    const { rows } = await db.raw("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today")
    if (filters.dateTo < rows[0].today) throw createError({ statusCode: 400, statusMessage: 'Choose an upcoming date range.' })
  }
  const labels = []
  if (filters.area) {
    const cities = await db('city').select('id', 'english_name', 'local_name', 'country_code', 'latitude', 'longitude')
    const identities = buildCityIdentities(cities)
    filters.area = resolveArea(filters.area, cities.map(city => ({ ...city, uniqueAliases: identities.uniqueAliases(city) })))
    if (filters.area.cityId) {
      query.city = filters.area.cityId; query.radius = String(filters.area.radiusKm)
    }
    labels.push(`${filters.area.label || `${filters.area.latitude}, ${filters.area.longitude}`} + ${filters.area.radiusKm} km`)
  } else if (filters.city) {
    const identities = buildCityIdentities(await db('city').select('id', 'english_name', 'local_name', 'country_code'))
    const city = identities.resolve(filters.city)
    filters.city = resolveCitySelection(filters.city, identities)
    if (filters.city.id && !city) throw createError({ statusCode: 400, statusMessage: 'Choose a valid city.' })
    labels.push(city ? `${city.english_name || city.local_name}, ${city.country_code}` : query.city)
  }
  if (filters.country) labels.push(new Intl.DisplayNames(['en'], { type: 'region' }).of(filters.country))
  if (!filters.area && !filters.city && !filters.country) labels.push('Worldwide')
  labels.push(...filters.composers)
  if (filters.works.length) {
    const works = await db('work').whereIn('id', filters.works).select('id', 'title')
    if (works.length !== filters.works.length) throw createError({ statusCode: 400, statusMessage: 'Choose valid works.' })
    labels.push(...works.map(w => w.title))
  }
  labels.push(filters.dateFrom || filters.dateTo ? `${filters.dateFrom || 'Now'} – ${filters.dateTo || 'onward'}` : 'Any upcoming date')
  return { query, filters, summary: labels.join(' · ') }
}
export function matching(db, filters) {
  return applyFilters(db('resolved_concert as cc').leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), filters)
}
export async function concertDetails(db, filters, ids) {
  const rows = await matching(db, filters).whereIn('cc.id', ids).select('cc.id', 'cc.title', 'cc.url', 'cc.venue', 'cc.time_from', db.raw("to_char(cc.date, 'YYYY-MM-DD') as date"), db.raw('COALESCE(canonical_city.english_name, canonical_city.local_name, cc.city_raw) as city')).orderBy('cc.date').orderBy('cc.id')
  const works = await concertWorks(db, ids).clearOrder().orderBy('title')
  const composers = await concertComposers(db, ids)
  return rows.map(row => ({ ...row, programme: works.filter(w => String(w.classical_concert_id) === String(row.id)).map(w => [w.composer_name, w.title].filter(Boolean).join(': ')).join('; ') || composers.filter(c => String(c.classical_concert_id) === String(row.id)).map(c => c.name).join(', ') }))
}
