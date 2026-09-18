// Check every English/local alias before exposing a readable city identity.
// This catalogue must include cities without concerts or coordinates too.
export function cityQueryValues(cities) {
  const aliases = new Map()
  const key = (name, country) => `${name.toLowerCase()},${country}`
  for (const city of cities) {
    for (const name of new Set([city.english_name, city.local_name].filter(Boolean))) {
      const alias = key(name, city.country_code)
      if (!aliases.has(alias)) aliases.set(alias, new Set())
      aliases.get(alias).add(String(city.id))
    }
  }
  return new Map(cities.map(city => [String(city.id), city.english_name && city.country_code
    && aliases.get(key(city.english_name, city.country_code))?.size === 1
    ? `${city.english_name},${city.country_code}` : String(city.id)]))
}
