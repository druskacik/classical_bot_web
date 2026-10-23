import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertSite } from '#concert-site'
import { getCountryName } from '../utils/countries.js'

export default defineEventHandler(async () => {
  try {
    return await cachedConcertData('countries', {}, async (knex) => {
      const countries = await knex('serving.current_concert')
        .select('country_code_resolved')
        .whereRaw('date >= CURRENT_DATE')
        .modify(query => { if (concertSite.country) query.where('country_code_resolved', concertSite.country) })
        .whereNotNull('country_code_resolved')
        .count('* as count')
        .groupBy('country_code_resolved')

      return countries
        .map(({ country_code_resolved: code, count }) => ({
          code,
          name: getCountryName(code),
          count: Number(count),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    })
  } catch (error) {
    if (error.statusCode) throw error
    console.error('Error fetching countries:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch countries',
    })
  }
})
