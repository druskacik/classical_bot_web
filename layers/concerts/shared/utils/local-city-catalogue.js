// Preserve the original /<local city name> URLs. Identity never depends on inventory.
const RESERVED = new Set(['blog', 'kontakt', 'zdroje', 'api', '_nuxt', 'sitemap.xml', 'robots.txt'])
export function buildLocalCityCatalogue(rows, country) {
  const cities = rows.filter(row => row.country_code === country).map(row => ({
    id: String(row.id), name: row.local_name || row.english_name,
    countryCode: country, countryName: 'Slovensko', countryPath: '/',
  })).filter(city => city.name).sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)
  const natural = new Set(cities.map(city => `/${city.name}`))
  const byId = new Map(), byPath = new Map()
  for (const city of cities) {
    // Route segments must not introduce a query, fragment, or additional path.
    let path = `/${encodeURIComponent(city.name)}`
    if (RESERVED.has(city.name.toLowerCase()) || byPath.has(decodeURIComponent(path))) {
      path += `-${city.id}`
      while (natural.has(decodeURIComponent(path)) || byPath.has(decodeURIComponent(path))) path += `-${city.id}`
    }
    const item = { ...city, path }
    byId.set(city.id, item)
    byPath.set(decodeURIComponent(path), item)
  }
  return { byId, byPath }
}

// The old site also linked unresolved city_raw values. Keep those exact historical
// names routable without inventing a canonical city or accepting arbitrary slugs.
export function addUnresolvedLocalCities(catalogue, names, country) {
  for (const name of names) {
    if (!name || RESERVED.has(name.toLowerCase()) || catalogue.byPath.has(`/${name}`)) continue
    catalogue.byPath.set(`/${name}`, {
      id: null, name, countryCode: country, countryName: 'Slovensko', countryPath: '/',
      filterValue: `${name},${country}`, path: `/${encodeURIComponent(name)}`,
    })
  }
  return catalogue
}
