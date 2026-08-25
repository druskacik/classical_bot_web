import knex from '../utils/connection.js'
import { getCountryName, normalizeCountryCode } from '../utils/countries.js'
import { containsNormalizedText, normalizedLikePattern, normalizeSearchText } from '../utils/search-text.js'

const OPTION_LIMIT = 20
const OPTION_TYPES = new Set(['city', 'composer', 'work'])
const firstQueryValue = value => Array.isArray(value) ? value[0] : value

const parseSelected = value => {
  const queryValue = firstQueryValue(value)
  return typeof queryValue === 'string'
    ? [...new Set(queryValue.split(',').map(item => item.trim()).filter(Boolean))]
    : []
}

const parseCityValue = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null
  const city = value.trim()
  if (/^\d+$/.test(city)) {
    const id = Number(city)
    return Number.isSafeInteger(id) && id > 0 ? { id, name: null, country: null } : null
  }

  const separator = city.lastIndexOf(',')
  if (separator === -1) return { id: null, name: city, country: null }

  const name = city.slice(0, separator).trim()
  const country = normalizeCountryCode(city.slice(separator + 1).trim())
  if (!country) return { id: null, name: city, country: null }
  return name ? { id: null, name, country } : null
}

const applyConcertScope = (builder, country) => {
  builder.whereRaw('cc.date >= CURRENT_DATE')
  builder.where('cc.inclusion_status', 'included')
  builder.whereNull('cc.duplicate_of_id')
  if (country) builder.where('cc.country_code_resolved', country)
  return builder
}

const cityQuery = (country, matchingCityIds, selectedOnly, selected) => {
  const selectedCity = selectedOnly ? parseCityValue(selected) : null
  const query = applyConcertScope(
    knex('classical_concert as cc')
      .join('city as canonical_city', 'canonical_city.id', 'cc.city_id')
      .select(
        selectedOnly
          ? knex.raw('?::text as value', [selected])
          : knex.raw("canonical_city.english_name || ',' || canonical_city.country_code as value"),
        knex.raw('canonical_city.english_name as label'),
        'canonical_city.country_code',
      )
      .count('* as count')
      .groupBy('canonical_city.english_name', 'canonical_city.country_code'),
    country,
  )

  if (selectedOnly) {
    if (!selectedCity) return null
    if (selectedCity.id) query.where('canonical_city.id', selectedCity.id)
    else {
      if (selectedCity.country) query.where('canonical_city.country_code', selectedCity.country)
      query.where(cityMatch => cityMatch
        .whereILike('canonical_city.english_name', selectedCity.name)
        .orWhereILike('canonical_city.local_name', selectedCity.name))
    }
  } else if (matchingCityIds) {
    query.whereIn('canonical_city.id', matchingCityIds)
  }

  return query.orderBy('count', 'desc').orderBy('label', 'asc').limit(OPTION_LIMIT)
}

const composerQuery = (country, search, selectedOnly, selected) => {
  const query = applyConcertScope(
    knex('classical_concert as cc')
      .join('classical_concert_composer as ccc', 'ccc.classical_concert_id', 'cc.id')
      .join('composer as c', 'c.id', 'ccc.composer_id')
      .select(knex.raw('c.name as value'), knex.raw('c.name as label'))
      .countDistinct('cc.id as count')
      .groupBy('c.name'),
    country,
  )

  if (selectedOnly) query.whereIn('c.name', selected)
  else if (search) query.whereILike('c.normalized_name', normalizedLikePattern(search))

  return query.orderBy('count', 'desc').orderBy('c.name', 'asc').limit(OPTION_LIMIT)
}

const workQuery = (country, search, selectedOnly, selected) => {
  const query = applyConcertScope(
    knex('classical_concert as cc')
      .join('classical_concert_work as ccw', 'ccw.classical_concert_id', 'cc.id')
      .join('work as w', 'w.id', 'ccw.work_id')
      .join('composer as c', 'c.id', 'w.composer_id')
      .select(
        knex.raw('w.id::text as value'),
        knex.raw('w.title as label'),
        knex.raw('c.name as "secondaryLabel"'),
      )
      .countDistinct('cc.id as count')
      .groupBy('w.id', 'w.title', 'c.name'),
    country,
  )

  if (selectedOnly) query.whereIn('w.id', selected.map(Number).filter(Number.isSafeInteger))
  else if (search) {
    const pattern = normalizedLikePattern(search)
    query.where(inner => inner
      .whereILike('w.normalized_title', pattern)
      .orWhereILike('c.normalized_name', pattern))
  }

  return query.orderBy('count', 'desc').orderBy('c.name', 'asc').orderBy('w.title', 'asc').limit(OPTION_LIMIT)
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const type = firstQueryValue(query.type)
    if (!OPTION_TYPES.has(type)) {
      throw createError({ statusCode: 400, statusMessage: 'Type must be city, composer, or work' })
    }

    const countryValue = firstQueryValue(query.country)
    const country = countryValue ? normalizeCountryCode(countryValue) : null
    if (countryValue && !country) {
      throw createError({ statusCode: 400, statusMessage: 'Country must be an ISO 3166-1 alpha-2 code' })
    }

    const searchValue = firstQueryValue(query.q)
    const search = typeof searchValue === 'string' ? searchValue.trim().slice(0, 100) : ''
    const normalizedSearch = normalizeSearchText(search)
    const selected = type === 'city'
      ? (typeof firstQueryValue(query.selected) === 'string' ? firstQueryValue(query.selected).trim() : '')
      : parseSelected(query.selected)
    let matchingCityIds = null
    if (type === 'city' && normalizedSearch) {
      const cityCandidates = knex('city').select('id', 'english_name', 'local_name')
      if (country) cityCandidates.where('country_code', country)
      matchingCityIds = (await cityCandidates)
        .filter(city => containsNormalizedText(city.english_name, normalizedSearch)
          || containsNormalizedText(city.local_name, normalizedSearch))
        .map(city => city.id)
    }

    const factory = type === 'city'
      ? (queryCountry, querySearch, selectedOnly, querySelected) => cityQuery(
          queryCountry,
          selectedOnly ? null : matchingCityIds,
          selectedOnly,
          querySelected,
        )
      : type === 'composer' ? composerQuery : workQuery

    const selectedQuery = type === 'city'
      ? (selected ? factory(country, '', true, selected) : null)
      : (selected.length ? factory(country, '', true, selected) : null)
    const [suggestions, selectedItems] = await Promise.all([
      factory(country, normalizedSearch, false, selected),
      selectedQuery || [],
    ])

    const items = [...selectedItems, ...suggestions].reduce((unique, item) => {
      if (!unique.some(candidate => candidate.value === item.value)) {
        unique.push({
          ...item,
          count: Number(item.count),
          secondaryLabel: type === 'city' && !country ? getCountryName(item.country_code) : item.secondaryLabel,
        })
      }
      return unique
    }, [])

    return { items: items.slice(0, OPTION_LIMIT + selectedItems.length) }
  } catch (error) {
    if (error.statusCode) throw error

    console.error('Error fetching concert filter options:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch filter options' })
  }
})
