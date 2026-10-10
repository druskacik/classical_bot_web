import { firstQueryValue as first, composerSelections, querySelections } from '../../shared/utils/concert-query.js'
import { getAreaCities } from '../utils/area-cities.js'
import { resolveArea, matchingAreaCities } from '../utils/concert-area.js'
import { concertFilterCacheInput } from '../utils/data-cache-keys.js'
import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertSite } from '#concert-site'
import knex from '../utils/connection.js'
import { getCountryName } from '../utils/countries.js'
import { containsNormalizedText, normalizedLikePattern, normalizeSearchText } from '../utils/search-text.js'
import { applyFilters, facetFilters, parseCity, parseConcertFilters } from '../utils/concert-filters.js'
import { getCityCatalogue } from '../utils/city-catalogue.js'
import { cityDisplayName, cityQueryValues } from '../../shared/utils/city-query.js'

const OPTION_LIMIT = 20


export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const type = first(query.type)
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
    const context = facetFilters(filters, type)
    if (concertSite.country) context.country = concertSite.country
    const search = normalizeSearchText(String(first(query.q) || '').trim().slice(0, 100))
    const selectedText = String(first(query.selected) || '').trim()
    const selected = type === 'city' ? (selectedText ? [selectedText] : []) : type === 'composer' ? composerSelections(selectedText) : querySelections(selectedText)
    if (type === 'city') selected.forEach(value => parseCity(value))
    return await cachedConcertData('filter-options', { type, filters: concertFilterCacheInput(context), search, selected }, async () => {
      const base = () => applyFilters(knex('classical_concert as cc')
        .leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), context)
      let suggestions
      let labels = []
      if (type === 'country') {
        const rows = await base().select('cc.country_code_resolved as value')
          .whereNotNull('cc.country_code_resolved').countDistinct('cc.id as count').groupBy('cc.country_code_resolved')
        suggestions = rows.map(row => ({ ...row, label: getCountryName(row.value) }))
        labels = selected.filter(value => !concertSite.country || value === concertSite.country).map(value => ({ value, label: getCountryName(value) }))
      } else if (type === 'city') {
        const cities = await knex('city').select('id', 'english_name', 'local_name', 'display_name', 'country_code')
          .modify(query => { if (concertSite.country) query.where('country_code', concertSite.country) })
        const values = cityQueryValues(cities)
        const [counts, rawCounts, coordinateCities] = await Promise.all([
          base().whereNotNull('canonical_city.id').select('canonical_city.id')
            .countDistinct('cc.id as count').groupBy('canonical_city.id'),
          base().whereNull('cc.city_id').whereNotNull('cc.city_raw')
            .select(knex.raw('LOWER(cc.city_raw) as name'), knex.raw('MIN(cc.city_raw) as label'),
              knex.raw('COALESCE(cc.country_code_resolved, cc.country_code_raw) as country_code'))
            .countDistinct('cc.id as count')
            .groupByRaw('LOWER(cc.city_raw), COALESCE(cc.country_code_resolved, cc.country_code_raw)'),
          getAreaCities(),
        ])
        const located = coordinateCities.filter(city => !concertSite.country || city.country_code === concertSite.country)
        const radiusAvailable = value => matchingAreaCities(located, value).length === 1
        const key = (name, country) => `${name},${country}`.toLowerCase()
        const byId = new Map(counts.map(row => [String(row.id), Number(row.count)]))
        const byName = new Map()
        // A readable filter includes every canonical English/local alias, but
        // an unlinked concert matches only its literal raw name and country.
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
        const options = new Map()
        const add = option => {
          if (option.count > 0 && option.value.length <= 160) options.set(option.value.toLowerCase(), option)
        }
        for (const row of rawCounts) {
          // Only offer values that parse into the same exact name/country.
          if (!row.label.trim() || row.label !== row.label.trim() || !/^[A-Z]{2}$/.test(row.country_code || '')) continue
          if (search && !containsNormalizedText(row.label, search)) continue
          const value = `${row.label},${row.country_code}`
          add({ value, label: row.label, country_code: row.country_code, count: byName.get(key(row.name, row.country_code)) })
        }
        for (const city of cities) {
          if (context.country && city.country_code !== context.country) continue
          const value = values.get(String(city.id))
          const identity = value.toLowerCase()
          // Prefer the reviewed label even when the raw name supplied the search match.
          if (!options.has(identity) && search && ![city.english_name, city.local_name, city.display_name].some(name => containsNormalizedText(name, search))) continue
          add({ value, label: cityDisplayName(city, concertSite.locale), country_code: city.country_code,
            count: /^\d+$/.test(value) ? byId.get(String(city.id)) || 0 : byName.get(identity) || 0 })
        }
        suggestions = [...options.values()]
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, concertSite.locale) || a.value.localeCompare(b.value))
          .slice(0, OPTION_LIMIT).map(option => ({ ...option, radiusAvailable: radiusAvailable(option.value) }))
        for (const value of selected) {
          const parsed = parseCity(value)
          if (concertSite.country && parsed?.country && parsed.country !== concertSite.country) continue
          const matches = cities.filter(city => parsed?.id ? Number(city.id) === parsed.id :
            (!parsed?.country || city.country_code === parsed.country) &&
            [city.english_name, city.local_name].some(name => name?.toLowerCase() === parsed?.name?.toLowerCase()))
          if (concertSite.country && parsed?.id && !matches.length) continue
          const city = matches.length === 1 ? matches[0] : null
          const row = await applyFilters(knex('classical_concert as cc').leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), { ...context, city: parsed }).countDistinct('cc.id as count').first()
          const option = { value, label: city ? cityDisplayName(city, concertSite.locale) : parsed?.name || value,
            country_code: city?.country_code || parsed?.country || concertSite.country
              || (new Set(matches.map(city => city.country_code)).size === 1 ? matches[0].country_code : undefined),
            count: Number(row.count), radiusAvailable: radiusAvailable(value) }
          // Keep the selected spelling so the control can restore its exact value,
          // without showing a second suggestion for a case-only variant.
          suggestions = suggestions.filter(item => item.value.toLowerCase() !== value.toLowerCase())
          labels.push(option)
        }
      } else {
        const music = builder => type === 'composer'
          ? builder.join('classical_concert_composer as ccc', 'ccc.classical_concert_id', 'cc.id').join('composer as c', 'c.id', 'ccc.composer_id')
          : builder.join('classical_concert_work as ccw', 'ccw.classical_concert_id', 'cc.id').join('work as w', 'w.id', 'ccw.work_id').join('composer as c', 'c.id', 'w.composer_id')
        const fields = type === 'composer' ? ['c.name as value', 'c.name as label'] : [knex.raw('w.id::text as value'), 'w.title as label', 'c.name as secondaryLabel']
        const grouped = () => music(base()).select(...fields).countDistinct('cc.id as count')
          .groupBy(...(type === 'composer' ? ['c.name'] : ['w.id', 'w.title', 'c.name']))
        const matching = grouped()
        if (search) matching.where(inner => {
          inner.whereILike('c.normalized_name', normalizedLikePattern(search))
          if (type === 'work') inner.orWhereILike('w.normalized_title', normalizedLikePattern(search))
        })
        suggestions = await matching.orderBy('count', 'desc').orderBy('label').limit(OPTION_LIMIT)
        if (selected.length) {
          const values = type === 'composer' ? selected : selected.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
          const key = type === 'composer' ? 'c.name' : 'w.id'
          const identities = type === 'composer' ? knex('composer as c') : knex('work as w').join('composer as c', 'c.id', 'w.composer_id')
          if (concertSite.country) {
            const scope = parseConcertFilters({}, concertSite.country)
            identities.whereIn(key, music(applyFilters(knex('classical_concert as cc').leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), scope)).select(key))
          }
          const [identitiesRows, counts] = await Promise.all([identities.select(...fields).whereIn(key, values), grouped().whereIn(key, values)])
          labels = identitiesRows.map(row => ({ ...row, count: Number(counts.find(item => item.value === row.value)?.count || 0) }))
        }
      }
      const items = new Map(suggestions.map(item => [String(item.value), { ...item, value: String(item.value), count: Number(item.count) }]))
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
