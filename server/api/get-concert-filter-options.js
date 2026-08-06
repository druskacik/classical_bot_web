import knex from '../utils/connection.js'
import { normalizeCountryCode } from '../utils/countries.js'

const OPTION_LIMIT = 20
const OPTION_TYPES = new Set(['city', 'composer', 'work'])
const firstQueryValue = value => Array.isArray(value) ? value[0] : value

const parseSelected = value => {
  const queryValue = firstQueryValue(value)
  return typeof queryValue === 'string'
    ? [...new Set(queryValue.split(',').map(item => item.trim()).filter(Boolean))]
    : []
}

const applyConcertScope = (builder, country) => {
  builder.whereRaw('cc.date >= CURRENT_DATE')
  if (country) builder.where('cc.country_code_resolved', country)
  return builder
}

const cityQuery = (country, search, selectedOnly, selected) => {
  const query = applyConcertScope(
    knex('classical_concert as cc')
      .join('city as canonical_city', 'canonical_city.id', 'cc.city_id')
      .select(
        knex.raw('canonical_city.id::text as value'),
        knex.raw('COALESCE(canonical_city.english_name, canonical_city.local_name) as label'),
      )
      .count('* as count')
      .groupBy('canonical_city.id', 'canonical_city.english_name', 'canonical_city.local_name'),
    country,
  )

  if (selectedOnly) {
    query.whereIn('canonical_city.id', selected.map(Number).filter(Number.isSafeInteger))
  } else if (search) {
    query.where((citySearch) => {
      citySearch
        .whereILike('canonical_city.english_name', `%${search}%`)
        .orWhereILike('canonical_city.local_name', `%${search}%`)
    })
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
  else if (search) query.whereILike('c.name', `%${search}%`)

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
    query.where(inner => inner.whereILike('w.title', `%${search}%`).orWhereILike('c.name', `%${search}%`))
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
    const selected = parseSelected(query.selected)
    const factory = type === 'city' ? cityQuery : type === 'composer' ? composerQuery : workQuery

    const [suggestions, selectedItems] = await Promise.all([
      factory(country, search, false, selected),
      selected.length ? factory(country, '', true, selected) : [],
    ])

    const items = [...selectedItems, ...suggestions].reduce((unique, item) => {
      if (!unique.some(candidate => candidate.value === item.value)) {
        unique.push({ ...item, count: Number(item.count) })
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
