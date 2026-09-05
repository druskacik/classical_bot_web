export const SLOVAK_STATIC_PATHS = ['/', '/kontakt', '/zdroje', '/blog', '/blog/o-projekte']
export function buildSlovakSitemapInventory(catalogue, counts) {
  const paths = new Set(SLOVAK_STATIC_PATHS)
  for (const row of counts) {
    const city = catalogue.byId.get(String(row.city_id))
    // The sitemap module encodes paths itself; pre-encoded accents become %25.
    if (row.country_code_resolved === 'SK' && city?.countryCode === 'SK' && Number(row.count) >= 10) paths.add(decodeURIComponent(city.path))
  }
  return [...paths].sort().map(loc => ({ loc }))
}
