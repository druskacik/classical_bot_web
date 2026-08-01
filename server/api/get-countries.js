import knex from '../utils/connection.js'
import { getCountryName } from '../utils/countries.js'

export default defineEventHandler(async () => {
  try {
    const countries = await knex('classical_concert')
      .select('country_code')
      .whereRaw('date >= CURRENT_DATE')
      .whereNotNull('country_code')
      .count('* as count')
      .groupBy('country_code')

    return countries
      .map(({ country_code: code, count }) => ({
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
