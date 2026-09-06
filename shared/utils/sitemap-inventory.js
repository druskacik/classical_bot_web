import { getCountryPath } from '../../layers/concerts/app/utils/countries.js'

export const CITY_SITEMAP_MIN_CONCERTS = 10

// Counts include only public upcoming concerts, grouped by resolved country/city.
export function buildSitemapInventory(catalogue, counts, composers = []) {
  const paths = new Set(['/', '/about', '/contact', '/sources', '/composers', ...composers.map(composer => composer.path)])
  for (const row of counts) {
    const countryPath = getCountryPath(row.country_code_resolved)
    if (Number(row.count) > 0 && countryPath) paths.add(countryPath)
    const city = catalogue.byId.get(String(row.city_id))
    if (city && city.countryCode === row.country_code_resolved && Number(row.count) >= CITY_SITEMAP_MIN_CONCERTS) {
      paths.add(city.path)
    }
  }
  return [...paths].sort().map(loc => ({ loc }))
}
