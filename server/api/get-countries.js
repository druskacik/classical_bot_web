import knex from '../utils/connection.js'
import { getCountryName } from '../utils/countries.js'

export default defineEventHandler(async () => {
  try {
    const countries = await knex('classical_concert')
      .select('country_code_resolved')
      .whereRaw('date >= CURRENT_DATE')
      .where('inclusion_status', 'included')
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
  } catch (error) {
    console.error('Error fetching countries:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch countries',
    })
  }
})
