import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertSite } from '#concert-site'
import { parseConcertFilters } from '../utils/concert-filters.js'
import knex from '../utils/connection.js'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { country } = parseConcertFilters({ country: query.country }, concertSite.country)

    return await cachedConcertData('composers', { country }, async () => {
      const composerQuery = knex('composer')
        .select('composer.name')
        .join('classical_concert_composer', 'composer.id', '=', 'classical_concert_composer.composer_id')
        .join('classical_concert', 'classical_concert.id', '=', 'classical_concert_composer.classical_concert_id')
        .whereRaw('classical_concert.date >= CURRENT_DATE')
        .where('classical_concert.inclusion_status', 'included')
        .whereNull('classical_concert.duplicate_of_id')
        .count('classical_concert_composer.composer_id as count')
        .groupBy('composer.name')
        .orderBy('count', 'desc')

      if (country) {
        composerQuery.where('classical_concert.country_code_resolved', country)
      }

      const composers = await composerQuery

      return composers.map(composer => composer.name)
    })
  } catch (error) {
    if (error.statusCode) throw error

    console.error('Error fetching composers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch composers',
    })
  }
})
