import { getCountryPath } from '../../layers/concerts/app/utils/countries.js'

// A named city search also matches aliases and unresolved raw city labels.
// Only an explicit country + city ID is equivalent to a fixed city route.
export function legacyConcertLocation(query, catalogue) {
  if (typeof query.country !== 'string' || ['radius', 'nearLat', 'nearLng', 'bounds'].some(key => key in query)) return null
  const country = query.country.trim().toUpperCase()
  let path = getCountryPath(country)
  if (!path) return null
  if (query.city !== undefined) {
    if (typeof query.city !== 'string' || !/^[1-9]\d*$/.test(query.city)) return null
    const city = catalogue?.byId.get(query.city)
    if (!city || city.countryCode !== country) return null
    path = city.path
  }
  const { country: _country, city: _city, ...remaining } = query
  return { path, query: remaining }
}
