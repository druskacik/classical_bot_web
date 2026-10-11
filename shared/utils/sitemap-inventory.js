import { getCountryPath } from '../../layers/concerts/app/utils/countries.js'
import { subjectListingPath } from '../../layers/concerts/shared/utils/subject-discovery.js'

export const CITY_SITEMAP_MIN_CONCERTS = 1

// Counts include only public upcoming concerts, grouped by resolved country/city.
export function buildSitemapInventory(catalogue, counts, composers = [], subjects = []) {
  const paths = new Set(['/', '/about', '/api', '/blog', '/contact', '/sources', '/composers', ...composers.map(composer => composer.path)])
  for (const row of counts) {
    const countryPath = getCountryPath(row.country_code_resolved)
    if (Number(row.count) > 0 && countryPath) paths.add(countryPath)
    const city = catalogue.byId.get(String(row.city_id))
    if (city && city.countryCode === row.country_code_resolved && Number(row.count) >= CITY_SITEMAP_MIN_CONCERTS) {
      paths.add(city.path)
    }
  }
  for (const row of subjects) {
    if (Number(row.count) < 1) continue
    const subject = row.type === 'composer' ? { type: 'composer', id: row.id, name: row.name }
      : { type: 'work', id: row.id }
    paths.add(subjectListingPath('/', subject))
    const countryPath = getCountryPath(row.country_code_resolved)
    if (countryPath) paths.add(subjectListingPath(countryPath, subject))
    const city = catalogue.byId.get(String(row.city_id))
    if (city && city.countryCode === row.country_code_resolved) paths.add(subjectListingPath(city.path, subject))
  }
  return [...paths].sort().map(loc => ({ loc }))
}
