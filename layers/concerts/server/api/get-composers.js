import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertSite } from '#concert-site'
import { parseConcertFilters } from '../utils/concert-filters.js'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { country } = parseConcertFilters({ country: query.country }, concertSite.country)

    return await cachedConcertData('composers', { country }, async (knex) => {
      const composerQuery = knex('resolved_concert_composer as composer')
        .select(knex.raw("composer.composer->>'name' as name"))
        .join('resolved_concert as cc', 'cc.id', 'composer.concert_id')
        .whereRaw('cc.date >= CURRENT_DATE')
        .countDistinct('cc.id as count')
        .groupByRaw("composer.composer->>'name'")
        .orderBy('count', 'desc')

      if (country) {
        composerQuery.where('cc.country_code_resolved', country)
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
