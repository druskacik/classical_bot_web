// Identity comparisons intentionally do not fold accents or use fuzzy matching.
export const cityAliasKey = (name, country) => `${name.toLowerCase()},${country.toUpperCase()}`
export const cityAliases = city => [...new Set([city.english_name, city.local_name].filter(Boolean).map(name => name.toLowerCase()))].sort()

export function buildCityIdentities(cities) {
  const byId = new Map(cities.map(city => [String(city.id), city]))
  const byAlias = new Map()
  for (const city of cities) {
    for (const name of cityAliases(city)) {
      const key = cityAliasKey(name, city.country_code)
      if (!byAlias.has(key)) byAlias.set(key, new Set())
      byAlias.get(key).add(String(city.id))
    }
  }
  const uniqueAliases = city => cityAliases(city).filter(name => byAlias.get(cityAliasKey(name, city.country_code))?.size === 1)
  const resolve = selection => {
    if (!selection) return null
    if (selection.id) return byId.get(String(selection.id)) || null
    const matches = selection.country
      ? [...(byAlias.get(cityAliasKey(selection.name, selection.country)) || [])].map(id => byId.get(id))
      : cities.filter(city => cityAliases(city).includes(selection.name.toLowerCase()))
    return matches.length === 1 ? matches[0] : null
  }
  return { byId, byAlias, uniqueAliases, resolve }
}

export function resolveCitySelection(selection, identities) {
  const city = identities.resolve(selection)
  return city ? { ...selection, canonicalId: String(city.id), countryCode: city.country_code,
    aliases: identities.uniqueAliases(city) } : selection
}
