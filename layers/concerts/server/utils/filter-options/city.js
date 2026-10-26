// @ts-check
/** @typedef {import('./types').LoaderInput} LoaderInput */
/** @typedef {import('./types').LoaderResult} LoaderResult */
import { dailyCounts, rawCitySummary, summaryEligible } from '../serving-facets.js'
import { getAreaCities } from '../area-cities.js'
import { matchingAreaCities } from '../concert-area.js'
import { parseCity, applyFilters } from '../concert-filters.js'
import { resolveCitySelection } from '../../../shared/utils/city-identity.js'
import { cityDisplayName, cityQueryValues } from '../../../shared/utils/city-query.js'
import { normalizeSearchText, containsNormalizedText } from '../search-text.js'
import { baseQuery, publicLocations as queryPublicLocations, OPTION_LIMIT } from './queries.js'

/** @param {(string | null | undefined)[]} values @param {string} search */
const searchRank = (values, search) => {
  if (!search) return 0
  const names = values.map(normalizeSearchText)
  return names.includes(search) ? 0 : names.some(name => name.startsWith(search)) ? 1 : 2
}

/** @param {LoaderInput} input @returns {Promise<LoaderResult>} */
export async function loadCityOptions(input) {
  const { db: knex, request: { context, search, selected, includeUnavailable, identityCities, identities }, site: concertSite } = input
  const base = () => baseQuery(input)
  const publicLocations = () => queryPublicLocations(input)
  /** @type {(import('./types').OptionRow & { value: string })[]} */
  let suggestions = []
  /** @type {import('./types').OptionRow[]} */
  let labels = []
  const cities = identityCities.filter(city => !concertSite.country || city.country_code === concertSite.country)
  const values = cityQueryValues(cities)
  // These queries share one snapshot/connection, so Promise.all cannot
  // parallelize their SQL. Read raw labels once, joining only matching IDs
  // for counts instead of fetching the same wide concert rows twice.
  // Historical labels also preserve ambiguous aliases of available cities.
  /** @type {[import('./types').CityCountRow[], import('./types').RawCityRow[], import('./types').IdentityCity[]]} */
  const [counts, rawLocations, coordinateCities] = await Promise.all([
    summaryEligible(context) ? knex.from(dailyCounts(knex,'city',context).as('counts')).select('value as id','count') : base().whereNotNull('canonical_city.id').select('canonical_city.id')
      .countDistinct('cc.id as count').groupBy('canonical_city.id'),
    summaryEligible(context) ? rawCitySummary(knex,context) : publicLocations().whereNull('cc.city_id').whereNotNull('cc.city_raw')
      .leftJoin(base().whereNull('cc.city_id').select('cc.id').as('available'), 'available.id', 'cc.id')
      .modify(builder => { if (context.country) builder.whereRaw('COALESCE(cc.country_code_resolved, cc.country_code_raw) = ?', [context.country]) })
      .select(knex.raw('LOWER(cc.city_raw) as name'), knex.raw('MIN(cc.city_raw) as label'),
        knex.raw('COALESCE(cc.country_code_resolved, cc.country_code_raw) as country_code'))
      .countDistinct('available.id as count')
      .groupByRaw('LOWER(cc.city_raw), COALESCE(cc.country_code_resolved, cc.country_code_raw)'),
    getAreaCities(),
  ])
  const rawCounts = rawLocations.filter(row => Number(row.count) > 0)
  const located = coordinateCities.filter(city => !concertSite.country || city.country_code === concertSite.country)
  /** @param {string} value */
  const radiusAvailable = value => matchingAreaCities(located, value).length === 1
  /** @param {string} name @param {string} country */
  const key = (name, country) => `${name},${country}`.toLowerCase()
  const byId = new Map(counts.map(row => [String(row.id), Number(row.count)]))
  const byName = new Map()
  // A readable filter includes every canonical English/local alias, but
  // legacy ambiguous options retain literal raw-name matching.
  for (const city of cities) {
    for (const name of new Set([city.english_name, city.local_name].flatMap(name => name ? [name.toLowerCase()] : []))) {
      const identity = key(name, city.country_code)
      byName.set(identity, (byName.get(identity) || 0) + (byId.get(String(city.id)) || 0))
    }
  }
  for (const row of rawCounts) {
    const identity = key(row.name, row.country_code)
    byName.set(identity, (byName.get(identity) || 0) + Number(row.count))
  }
  const rawByName = new Map(rawCounts.map(row => [key(row.name, row.country_code), Number(row.count)]))
  /** @param {import('./types').IdentityCity} city */
  const canonicalCount = city => (byId.get(String(city.id)) || 0) + identities.uniqueAliases(city)
    .reduce((sum, name) => sum + (rawByName.get(key(name, city.country_code)) || 0), 0)
  /** @type {Map<string, import('./types').RankedCityOption>} */
  const options = new Map()
  /** @param {import('./types').RankedCityOption} option */
  const add = option => {
    if (option.value.length <= 160) options.set(option.value.toLowerCase(), option)
  }
  for (const row of rawLocations) {
    // Only offer values that parse into the same exact name/country.
    if (!row.label.trim() || row.label !== row.label.trim() || !/^[A-Z]{2}$/.test(row.country_code || '')) continue
    if (identities.resolve({ name: row.name, country: row.country_code })) continue
    if (search && !containsNormalizedText(row.label, search)) continue
    const value = `${row.label},${row.country_code}`
    add({ value, label: row.label, country_code: row.country_code, count: byName.get(key(row.name, row.country_code)) || 0, searchRank: searchRank([row.label], search) })
  }
  for (const city of cities) {
    if (context.country && city.country_code !== context.country) continue
    const value = values.get(String(city.id))
    const identity = value.toLowerCase()
    // Prefer the reviewed label even when the raw name supplied the search match.
    if (!options.has(identity) && search && ![city.english_name, city.local_name, city.display_name].some(name => containsNormalizedText(name, search))) continue
    add({ value, label: cityDisplayName(city, concertSite.locale), country_code: city.country_code,
      count: canonicalCount(city),
      searchRank: Math.min(options.get(identity)?.searchRank ?? 2, searchRank([city.english_name, city.local_name, city.display_name], search)) })
  }
  suggestions = [...options.values()]
    .filter(option => includeUnavailable || option.count > 0)
    .sort((a, b) => a.searchRank - b.searchRank || b.count - a.count || a.label.localeCompare(b.label, concertSite.locale) || a.value.localeCompare(b.value))
    .slice(0, OPTION_LIMIT).map(({ searchRank, ...option }) => ({ ...option, radiusAvailable: radiusAvailable(option.value) }))
  for (const value of selected) {
    const parsed = resolveCitySelection(parseCity(value), identities)
    if (concertSite.country && parsed?.country && parsed.country !== concertSite.country) continue
    const matches = cities.filter(city => parsed?.id ? Number(city.id) === parsed.id :
      (!parsed?.country || city.country_code === parsed.country) &&
      [city.english_name, city.local_name].some(name => name?.toLowerCase() === parsed?.name?.toLowerCase()))
    if (concertSite.country && parsed?.id && !matches.length) continue
    const city = matches.length === 1 ? matches[0] : null
    const row = await applyFilters(knex('serving.current_concert as cc').leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), { ...context, city: parsed }).countDistinct('cc.id as count').first()
    const option = { value, label: city ? cityDisplayName(city, concertSite.locale) : parsed?.name || value,
      country_code: city?.country_code || parsed?.country || concertSite.country
        || (new Set(matches.map(city => city.country_code)).size === 1 ? matches[0]?.country_code : undefined),
      count: Number(row.count), radiusAvailable: radiusAvailable(value) }
    // Keep the selected spelling so the control can restore its exact value,
    // without showing another suggestion for the same canonical city.
    suggestions = suggestions.filter(item => item.value.toLowerCase() !== value.toLowerCase()
      && !(parsed?.canonicalId && identities.resolve(parseCity(item.value))?.id.toString() === parsed.canonicalId))
    labels.push(option)
  }
  return { suggestions, selectedOptions: labels }
}
