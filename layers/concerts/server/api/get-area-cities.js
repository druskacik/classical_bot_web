import { concertSite } from '#concert-site'
import { getAreaCities, areaCityOptions } from '../utils/area-cities.js'
import { getCountryName } from '../utils/countries.js'
import { matchingAreaCities } from '../utils/concert-area.js'
export default defineEventHandler(async event => {
  const query = getQuery(event)
  if (query.selected !== undefined && (typeof query.selected !== 'string' || !/^[1-9]\d*$/.test(query.selected))) {
    throw createError({ statusCode: 400, statusMessage: 'Selected city must be a positive integer ID' })
  }
  const names = new Intl.DisplayNames([concertSite.locale], { type: 'region' })
  let cities = await getAreaCities()
  if (query.origin !== undefined) {
    if (typeof query.origin !== 'string' || !query.origin.trim() || query.origin.length > 160) {
      throw createError({ statusCode: 400, statusMessage: 'Origin must be a city ID or name' })
    }
    // Resolve against the full catalogue, before autocomplete truncates results.
    cities = matchingAreaCities(cities, query.origin.trim())
    if (cities.length !== 1) return { items: [] }
  }
  return { items: areaCityOptions(cities, query.origin !== undefined ? '' : String(query.q || '').trim().slice(0, 100), query.selected, concertSite.locale, code => names.of(code) || getCountryName(code)) }
})
