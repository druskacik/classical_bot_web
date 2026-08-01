import ClassicalConcert from '../models/ClassicalConcert.cjs'
import { normalizeCountryCode } from '../utils/countries.js'

const parseCommaSeparatedValues = (value) => {
  if (typeof value !== 'string') return []

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const composers = parseCommaSeparatedValues(query.composers)
    const country = query.country ? normalizeCountryCode(query.country) : null

    if (query.country && !country) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Country must be an ISO 3166-1 alpha-2 code',
      })
    }
    
    let concertQuery = ClassicalConcert.query()
      .whereRaw('date >= CURRENT_DATE')
      .orderBy('date', 'asc')
      .orderBy('time_from', 'asc')
      .withGraphFetched('composers')
      .select(
        'id',
        'url',
        'title',
        'date',
        'time_from',
        'time_to',
        'city',
        'country_code',
        'source',
        'venue',
      )
    
    if (country) {
      concertQuery = concertQuery.where('country_code', country)
    }

    if (composers.length > 0) {
      concertQuery = concertQuery.whereExists(
        ClassicalConcert.relatedQuery('composers')
          .whereIn('composers.name', composers),
      )
    }

    const concerts = await concertQuery

    return concerts.map(concert => ({
      ...concert,
      title: concert.title.replace(/\s+/g, ' '),
    }))
  } catch (error) {
    if (error.statusCode) throw error

    console.error('Error fetching concerts:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch concerts',
    })
  }
})
