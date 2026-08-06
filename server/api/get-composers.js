import knex from '../utils/connection.js'
import { normalizeCountryCode } from '../utils/countries.js'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const country = query.country ? normalizeCountryCode(query.country) : null

    if (query.country && !country) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Country must be an ISO 3166-1 alpha-2 code',
      })
    }

    const composerQuery = knex('composer')
      .select('composer.name')
      .join('classical_concert_composer', 'composer.id', '=', 'classical_concert_composer.composer_id')
      .join('classical_concert', 'classical_concert.id', '=', 'classical_concert_composer.classical_concert_id')
      .whereRaw('classical_concert.date >= CURRENT_DATE')
      .count('classical_concert_composer.composer_id as count')
      .groupBy('composer.name')
      .orderBy('count', 'desc')

    if (country) {
      composerQuery.where('classical_concert.country_code_resolved', country)
    }

    const composers = await composerQuery

    return composers.map(composer => composer.name)
  } catch (error) {
    if (error.statusCode) throw error

    console.error('Error fetching composers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch composers',
    })
  }
})
