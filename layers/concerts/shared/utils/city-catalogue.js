import { getCountryName, getCountryPath, getCountrySlug } from '../../app/utils/countries.js'

// Reserve every natural slug before allocating collision suffixes. Catalogue
// membership, never today's concert inventory, determines a city's URL.
export function buildCityCatalogue(rows) {
  const cities = rows.map(row => ({
    id: String(row.id),
    name: row.english_name,
    countryCode: row.country_code,
    countryName: getCountryName(row.country_code),
    countryPath: getCountryPath(row.country_code),
    baseSlug: getCountrySlug(row.english_name) || `city-${row.id}`,
  })).sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)
  const reserved = new Set(cities.map(city => `${city.countryPath}/${city.baseSlug}`))
  const byId = new Map()
  const byPath = new Map()
  for (const city of cities) {
    if (!city.countryPath) continue
    let path = `${city.countryPath}/${city.baseSlug}`
    if (byPath.has(path)) {
      path += `-${city.id}`
      while (reserved.has(path) || byPath.has(path)) path += `-${city.id}`
    }
    const { baseSlug, ...identity } = city
    const item = { ...identity, path }
    byId.set(city.id, item)
    byPath.set(path, item)
  }
  return { byId, byPath }
}
