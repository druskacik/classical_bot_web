import knex from '../utils/connection.js'
import { normalizeCountryCode } from '../utils/countries.js'

const PAGE_SIZE = 50
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const firstQueryValue = value => Array.isArray(value) ? value[0] : value

const parseCommaSeparatedValues = (value) => {
  const queryValue = firstQueryValue(value)
  if (typeof queryValue !== 'string') return []

  return [...new Set(queryValue
    .split(',')
    .map(item => item.trim())
    .filter(Boolean))]
}

const parsePage = (value) => {
  const queryValue = firstQueryValue(value)
  if (queryValue === undefined) return 1

  const page = Number(queryValue)
  if (!Number.isSafeInteger(page) || page < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Page must be a positive integer' })
  }
  return page
}

const parseDate = (value, label) => {
  const queryValue = firstQueryValue(value)
  if (queryValue === undefined) return null
  if (typeof queryValue !== 'string' || !ISO_DATE_PATTERN.test(queryValue)) {
    throw createError({ statusCode: 400, statusMessage: `${label} must use YYYY-MM-DD` })
  }

  const parsed = new Date(`${queryValue}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== queryValue) {
    throw createError({ statusCode: 400, statusMessage: `${label} must be a valid date` })
  }
  return queryValue
}

const parseWorkIds = value => parseCommaSeparatedValues(value).map((item) => {
  const id = Number(item)
  if (!Number.isSafeInteger(id) || id < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Works must contain positive integer IDs' })
  }
  return id
})

const parseCity = (value) => {
  const queryValue = firstQueryValue(value)
  if (typeof queryValue !== 'string' || !queryValue.trim()) return null

  const city = queryValue.trim()
  if (city.length > 160) {
    throw createError({ statusCode: 400, statusMessage: 'City is too long' })
  }

  if (!/^\d+$/.test(city)) {
    const separator = city.lastIndexOf(',')
    if (separator === -1) return { id: null, name: city, country: null }

    const name = city.slice(0, separator).trim()
    const countryValue = city.slice(separator + 1).trim()
    const country = normalizeCountryCode(countryValue)
    if (!country) return { id: null, name: city, country: null }
    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'City must use "City name,CC" with an ISO country code',
      })
    }
    return { id: null, name, country }
  }

  const id = Number(city)
  if (!Number.isSafeInteger(id) || id < 1) {
    throw createError({ statusCode: 400, statusMessage: 'City ID must be a positive integer' })
  }
  return { id, name: null, country: null }
}

const applyFilters = (builder, filters) => {
  builder.whereRaw('cc.date >= CURRENT_DATE')
  builder.where('cc.inclusion_status', 'included')

  if (filters.country) builder.where('cc.country_code_resolved', filters.country)
  if (filters.city?.id) builder.where('cc.city_id', filters.city.id)
  else if (filters.city?.name) {
    if (filters.city.country) {
      builder.whereRaw(
        'COALESCE(canonical_city.country_code, cc.country_code_resolved, cc.country_code_raw) = ?',
        [filters.city.country],
      )
    }
    builder.where((cityFilter) => {
      cityFilter
        .whereILike('canonical_city.english_name', filters.city.name)
        .orWhereILike('canonical_city.local_name', filters.city.name)
      if (filters.city.country) {
        cityFilter.orWhere(unresolvedCity => unresolvedCity
          .whereNull('cc.city_id')
          .whereILike('cc.city_raw', filters.city.name))
      } else {
        cityFilter.orWhereILike('cc.city_raw', filters.city.name)
      }
    })
  }
  if (filters.dateFrom) builder.where('cc.date', '>=', filters.dateFrom)
  if (filters.dateTo) builder.where('cc.date', '<=', filters.dateTo)

  if (filters.composers.length) {
    builder.whereExists(function composerFilter() {
      this.select(knex.raw('1'))
        .from('classical_concert_composer as ccc')
        .join('composer as composer_filter', 'composer_filter.id', 'ccc.composer_id')
        .whereRaw('ccc.classical_concert_id = cc.id')
        .whereIn('composer_filter.name', filters.composers)
    })
  }

  if (filters.works.length) {
    builder.whereExists(function workFilter() {
      this.select(knex.raw('1'))
        .from('classical_concert_work as ccw')
        .whereRaw('ccw.classical_concert_id = cc.id')
        .whereIn('ccw.work_id', filters.works)
    })
  }

  return builder
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const countryValue = firstQueryValue(query.country)
    const country = countryValue ? normalizeCountryCode(countryValue) : null
    if (countryValue && !country) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Country must be an ISO 3166-1 alpha-2 code',
      })
    }

    const page = parsePage(query.page)
    const dateFrom = parseDate(query.dateFrom, 'Start date')
    const dateTo = parseDate(query.dateTo, 'End date')
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw createError({ statusCode: 400, statusMessage: 'End date must not be before start date' })
    }

    const city = parseCity(query.city)
    if (country && city?.country && country !== city.country) {
      throw createError({
        statusCode: 400,
        statusMessage: 'City country must match the selected country',
      })
    }

    const filters = {
      country,
      city,
      dateFrom,
      dateTo,
      composers: parseCommaSeparatedValues(query.composers),
      works: parseWorkIds(query.works),
    }

    const countQuery = applyFilters(
      knex('classical_concert as cc')
        .leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id')
        .count('* as total')
        .first(),
      filters,
    )
    const itemQuery = applyFilters(
      knex('classical_concert as cc')
        .leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id')
        .select(
          'cc.id',
          'cc.url',
          'cc.title',
          'cc.date',
          'cc.time_from',
          'cc.time_to',
          'cc.city_id',
          knex.raw('COALESCE(canonical_city.english_name, canonical_city.local_name, cc.city_raw) as city'),
          knex.raw('COALESCE(cc.country_code_resolved, cc.country_code_raw) as country_code'),
          'cc.source',
          'cc.source_url',
          'cc.venue',
        ),
      filters,
    )
      .orderBy('cc.date', 'asc')
      .orderByRaw('cc.time_from ASC NULLS LAST')
      .orderBy('cc.id', 'asc')
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)

    const [countRow, concerts] = await Promise.all([countQuery, itemQuery])
    const concertIds = concerts.map(concert => concert.id)
    const composerRows = concertIds.length
      ? await knex('classical_concert_composer as ccc')
          .join('composer as c', 'c.id', 'ccc.composer_id')
          .whereIn('ccc.classical_concert_id', concertIds)
          .select('ccc.classical_concert_id', 'c.id', 'c.name')
          .orderBy('c.name', 'asc')
      : []

    const composersByConcert = composerRows.reduce((groups, composer) => {
      const id = composer.classical_concert_id
      if (!groups[id]) groups[id] = []
      groups[id].push({ id: composer.id, name: composer.name })
      return groups
    }, {})

    const total = Number(countRow.total)
    return {
      items: concerts.map(concert => ({
        ...concert,
        title: concert.title.replace(/\s+/g, ' '),
        composers: composersByConcert[concert.id] || [],
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: total ? Math.ceil(total / PAGE_SIZE) : 0,
    }
  } catch (error) {
    if (error.statusCode) throw error

    console.error('Error fetching concerts:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch concerts',
    })
  }
})
