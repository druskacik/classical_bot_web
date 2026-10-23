import { firstQueryValue as first, composerSelections, querySelections } from '../../shared/utils/concert-query.js'
import { buildCityIdentities, resolveCitySelection } from '../../shared/utils/city-identity.js'
import { getAreaCities, getIdentityCities } from '../utils/area-cities.js'
import { resolveArea, matchingAreaCities } from '../utils/concert-area.js'
import { concertFilterCacheInput } from '../utils/data-cache-keys.js'
import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertSite } from '#concert-site'
import { getCountryName } from '../utils/countries.js'
import { containsNormalizedText, normalizedLikePattern, normalizeSearchText } from '../utils/search-text.js'
import { applyFilters, facetFilters, parseCity, parseConcertFilters } from '../utils/concert-filters.js'
import { getCityCatalogue } from '../utils/city-catalogue.js'
import { composerIdentities } from '../utils/composer-identities.js'
import { cityDisplayName, cityQueryValues } from '../../shared/utils/city-query.js'

const OPTION_LIMIT = 20
const searchRank = (values, search) => {
  if (!search) return 0
  const names = values.map(normalizeSearchText)
  return names.includes(search) ? 0 : names.some(name => name.startsWith(search)) ? 1 : 2
}


export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const type = first(query.type)
    const includeUnavailable = first(query.includeUnavailable) === 'true'
    if (!['country', 'city', 'composer', 'work'].includes(type)) {
      throw createError({ statusCode: 400, statusMessage: 'Type must be country, city, composer, or work' })
    }
    const filters = parseConcertFilters(query, concertSite.country)
    if (filters.area) filters.area = resolveArea(filters.area, await getAreaCities(), concertSite.locale)
    // Retain the canonical-city parameter used by existing API callers.
    if (query.cityId !== undefined) {
      const id = first(query.cityId)
      if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) {
        throw createError({ statusCode: 400, statusMessage: 'City ID must be a positive integer' })
      }
      const city = (await getCityCatalogue()).byId.get(id)
      if (!city || (filters.country && filters.country !== city.countryCode)) {
        throw createError({ statusCode: 400, statusMessage: 'City must match the selected country' })
      }
      filters.country = city.countryCode
      if (!filters.city) filters.city = parseCity(id)
    }
    const identityCities = type === 'city' || filters.city ? await getIdentityCities() : []
    const identities = buildCityIdentities(identityCities)
    if (filters.city) filters.city = resolveCitySelection(filters.city, identities)
    const context = facetFilters(filters, type)
    if (concertSite.country) context.country = concertSite.country
    const search = normalizeSearchText(String(first(query.q) || '').trim().slice(0, 100))
    const selectedText = String(first(query.selected) || '').trim()
    const selected = type === 'city' ? (selectedText ? [selectedText] : []) : type === 'composer' ? composerSelections(selectedText) : querySelections(selectedText)
    if (type === 'city') selected.forEach(value => parseCity(value))
    return await cachedConcertData('filter-options', { type, filters: concertFilterCacheInput(context), search, selected, includeUnavailable }, async (knex) => {
      const base = () => applyFilters(knex('resolved_concert as cc')
        .leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), context)
      // Catalogue locations include past public records, independent of availability.
      const publicLocations = () => knex('resolved_concert as cc')
        .modify(builder => { if (concertSite.country) builder.where('cc.country_code_resolved', concertSite.country) })
      let suggestions
      let labels = []
      if (type === 'country') {
        const rows = await base().select('cc.country_code_resolved as value')
          .whereNotNull('cc.country_code_resolved').countDistinct('cc.id as count').groupBy('cc.country_code_resolved')
        const catalogue = await knex('city').distinct('country_code as value')
          .modify(builder => { if (concertSite.country) builder.where('country_code', concertSite.country) })
          .union(publicLocations().distinct(knex.raw('COALESCE(cc.country_code_resolved, cc.country_code_raw) as value')))
        const counts = new Map(rows.map(row => [row.value, Number(row.count)]))
        suggestions = catalogue.filter(row => /^[A-Z]{2}$/.test(row.value || ''))
          .map(row => ({ value: row.value, label: getCountryName(row.value), count: counts.get(row.value) || 0 }))
        labels = selected.filter(value => !concertSite.country || value === concertSite.country).map(value => ({ value, label: getCountryName(value) }))
      } else if (type === 'city') {
        const cities = identityCities.filter(city => !concertSite.country || city.country_code === concertSite.country)
        const values = cityQueryValues(cities)
        // These queries share one snapshot/connection, so Promise.all cannot
        // parallelize their SQL. Read raw labels once, joining only matching IDs
        // for counts instead of fetching the same wide concert rows twice.
        // Historical labels also preserve ambiguous aliases of available cities.
        const [counts, rawLocations, coordinateCities] = await Promise.all([
          base().whereNotNull('canonical_city.id').select('canonical_city.id')
            .countDistinct('cc.id as count').groupBy('canonical_city.id'),
          publicLocations().whereNull('cc.city_id').whereNotNull('cc.city_raw')
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
        const radiusAvailable = value => matchingAreaCities(located, value).length === 1
        const key = (name, country) => `${name},${country}`.toLowerCase()
        const byId = new Map(counts.map(row => [String(row.id), Number(row.count)]))
        const byName = new Map()
        // A readable filter includes every canonical English/local alias, but
        // legacy ambiguous options retain literal raw-name matching.
        for (const city of cities) {
          for (const name of new Set([city.english_name, city.local_name].filter(Boolean).map(name => name.toLowerCase()))) {
            const identity = key(name, city.country_code)
            byName.set(identity, (byName.get(identity) || 0) + (byId.get(String(city.id)) || 0))
          }
        }
        for (const row of rawCounts) {
          const identity = key(row.name, row.country_code)
          byName.set(identity, (byName.get(identity) || 0) + Number(row.count))
        }
        const rawByName = new Map(rawCounts.map(row => [key(row.name, row.country_code), Number(row.count)]))
        const canonicalCount = city => (byId.get(String(city.id)) || 0) + identities.uniqueAliases(city)
          .reduce((sum, name) => sum + (rawByName.get(key(name, city.country_code)) || 0), 0)
        const options = new Map()
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
          const row = await applyFilters(knex('resolved_concert as cc').leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), { ...context, city: parsed }).countDistinct('cc.id as count').first()
          const option = { value, label: city ? cityDisplayName(city, concertSite.locale) : parsed?.name || value,
            country_code: city?.country_code || parsed?.country || concertSite.country
              || (new Set(matches.map(city => city.country_code)).size === 1 ? matches[0].country_code : undefined),
            count: Number(row.count), radiusAvailable: radiusAvailable(value) }
          // Keep the selected spelling so the control can restore its exact value,
          // without showing another suggestion for the same canonical city.
          suggestions = suggestions.filter(item => item.value.toLowerCase() !== value.toLowerCase()
            && !(parsed?.canonicalId && identities.resolve(parseCity(item.value))?.id.toString() === parsed.canonicalId))
          labels.push(option)
        }
      } else {
        // Scalar projections inline into the joins. jsonb_to_record hides the
        // grouping cardinality from PostgreSQL, which can estimate one composer
        // and repeatedly rescan the identity catalogue for thousands of groups.
        const composerSnapshots = () => knex('resolved_concert_composer')
          .select('concert_id', 'composer_id as id', knex.raw("composer->>'name' as name"))
        const fields = type === 'composer' ? ['c.name as value', 'c.name as label'] : [knex.raw('w.id::text as value'), 'w.title as label', 'c.name as secondaryLabel']
        const grouped = () => type === 'composer'
          ? base().join(composerSnapshots().as('c'), 'c.concert_id', 'cc.id')
              .select(...fields).countDistinct('cc.id as count').groupBy('c.name')
          // Work suggestions join availability by ID, not title. Keep native
          // keys for planner statistics/indexes; only serialize IDs at the edge.
          // The publication already includes each work's composer, so counting
          // works needs neither JSON labels nor another relationship join.
          : base().join('resolved_concert_work as ccw', 'ccw.concert_id', 'cc.id')
              .select('ccw.work_id as value').countDistinct('cc.id as count').groupBy('ccw.work_id')
        // Published names/search keys stay aligned with availability and filtering.
        // Only composers absent from the publication use live catalogue identities.
        const identities = () => type === 'composer'
          ? knex.from(composerIdentities(knex).as('c'))
          : knex('work as w').join(composerIdentities(knex).as('c'), 'c.id', 'w.composer_id')
        const key = type === 'composer' ? 'c.name' : 'w.id'
        const matching = identities().select(...fields)
          .select(knex.raw('COALESCE(availability.count, 0) as count'))
          .leftJoin(grouped().as('availability'), type === 'composer' ? 'c.name' : 'w.id', 'availability.value')
        if (type === 'work' && context.composers.length) {
          // Composer and work filters match the concert independently: retain
          // other composers' works on matching programmes, while limiting only
          // zero-match catalogue suggestions to the selected composers.
          matching.where(inner => inner.whereIn('c.name', context.composers).orWhere('availability.count', '>', 0))
        }
        if (!includeUnavailable) matching.where('availability.count', '>', 0)
        const searchFields = type === 'composer' ? ['c.normalized_name'] : ['w.normalized_title', 'c.normalized_name']
        if (search) {
          matching.where(inner => {
            for (const field of searchFields) inner.orWhereILike(field, normalizedLikePattern(search))
          })
          const rank = operator => searchFields.map(() => `?? ${operator} ?`).join(' OR ')
          matching.orderByRaw(`CASE WHEN ${rank('=')} THEN 0 WHEN ${rank('ILIKE')} THEN 1 ELSE 2 END`, [
            ...searchFields.flatMap(field => [field, search]),
            ...searchFields.flatMap(field => [field, normalizedLikePattern(search).slice(1)]),
          ])
        }
        suggestions = await matching.orderBy('count', 'desc').orderBy('label').orderByRaw('?? ASC', [key]).limit(OPTION_LIMIT)
        if (selected.length) {
          const values = type === 'composer' ? selected : selected.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
          const [identitiesRows, counts] = await Promise.all([
            identities().select(...fields).whereIn(key, values),
            grouped().whereIn(type === 'composer' ? 'c.name' : 'ccw.work_id', values),
          ])
          labels = identitiesRows.map(row => ({ ...row, count: Number(counts.find(item => String(item.value) === String(row.value))?.count || 0) }))
        }
      }
      const items = new Map(suggestions.filter(item => includeUnavailable || Number(item.count) > 0).map(item => [String(item.value), { ...item, value: String(item.value), count: Number(item.count) }]))
      for (const label of labels) if (!items.has(String(label.value))) items.set(String(label.value), { ...label, value: String(label.value), count: label.count || 0 })
      const result = [...items.values()].map(item => ({ ...item,
        ...(type === 'city' && !context.country ? { secondaryLabel: getCountryName(item.country_code) } : {}),
      }))
      if (type === 'country') result.sort((a, b) => a.label.localeCompare(b.label, 'en'))
      return { items: result }
    })
  } catch (error) {
    if (error.statusCode) throw error
    console.error('Error fetching concert filter options:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch filter options' })
  }
})
