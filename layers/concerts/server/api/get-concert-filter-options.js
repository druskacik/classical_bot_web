import { concertFilterCacheInput } from '../utils/data-cache-keys.js'
import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertSite } from '#concert-site'
import knex from '../utils/connection.js'
import { getCountryName } from '../utils/countries.js'
import { containsNormalizedText, normalizedLikePattern, normalizeSearchText } from '../utils/search-text.js'
import { applyFilters, facetFilters, parseCity, parseConcertFilters } from '../utils/concert-filters.js'
import { getCityCatalogue } from '../utils/city-catalogue.js'

const OPTION_LIMIT = 20
const first = value => Array.isArray(value) ? value[0] : value

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const type = first(query.type)
    if (!['country', 'city', 'composer', 'work'].includes(type)) {
      throw createError({ statusCode: 400, statusMessage: 'Type must be country, city, composer, or work' })
    }
    const filters = parseConcertFilters(query, concertSite.country)
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
    const selected = type === 'city' ? (selectedText ? [selectedText] : []) : selectedText.split(',').filter(Boolean)
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
        const cities = await knex('city').select('id', 'english_name', 'local_name', 'country_code')
          .modify(query => { if (concertSite.country) query.where('country_code', concertSite.country) })
        const candidates = cities.filter(city => (!context.country || city.country_code === context.country)
          && (!search || containsNormalizedText(city.english_name, search) || containsNormalizedText(city.local_name, search)))
        suggestions = await base().whereIn('canonical_city.id', candidates.map(city => city.id))
          .select(knex.raw("canonical_city.english_name || ',' || canonical_city.country_code as value"), knex.raw(`${concertSite.cityRoutes === 'local' ? 'COALESCE(canonical_city.local_name, canonical_city.english_name)' : 'canonical_city.english_name'} as label`), 'canonical_city.country_code')
          .countDistinct('cc.id as count').groupBy('canonical_city.english_name', ...(concertSite.cityRoutes === 'local' ? ['canonical_city.local_name'] : []), 'canonical_city.country_code')
          .orderBy('count', 'desc').orderBy('label').limit(OPTION_LIMIT)
        if (concertSite.cityRoutes === 'local') {
          const unresolved = await base().whereNull('cc.city_id').whereNotNull('cc.city_raw')
            .select(knex.raw("cc.city_raw || ',' || cc.country_code_resolved as value"), 'cc.city_raw as label', 'cc.country_code_resolved as country_code')
            .countDistinct('cc.id as count').groupBy('cc.city_raw', 'cc.country_code_resolved')
          suggestions = [...suggestions, ...unresolved.filter(city => !search || containsNormalizedText(city.label, search))]
            .sort((a, b) => Number(b.count) - Number(a.count) || a.label.localeCompare(b.label, 'sk')).slice(0, OPTION_LIMIT)
        }
        for (const value of selected) {
          const parsed = parseCity(value)
          const city = cities.find(city => parsed?.id ? Number(city.id) === parsed.id :
            (!parsed?.country || city.country_code === parsed.country) &&
            [city.english_name, city.local_name].some(name => name?.toLowerCase() === parsed?.name?.toLowerCase()))
          if (city) {
            const row = await applyFilters(knex('classical_concert as cc').leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), { ...context, city: parsed }).countDistinct('cc.id as count').first()
            labels.push({ value, label: concertSite.cityRoutes === 'local' ? city.local_name || city.english_name : city.english_name, country_code: city.country_code, count: Number(row.count) })
          } else if (!concertSite.country) labels.push({ value, label: parsed?.name || value })
          else if (parsed?.name && (!parsed.country || parsed.country === concertSite.country)) {
            const legacy = (await getCityCatalogue()).byPath.get(`/${parsed.name}`)
            if (legacy?.filterValue) {
              const row = await applyFilters(knex('classical_concert as cc').leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), { ...context, city: parsed }).countDistinct('cc.id as count').first()
              labels.push({ value, label: legacy.name, country_code: concertSite.country, count: Number(row.count) })
            }
          }
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
