import knex from '../utils/connection.js'
import { getCountryName } from '../utils/countries.js'

export default defineEventHandler(async () => {
  try {
    const rows = await knex('classical_concert')
      .distinct('country_code', 'source', 'source_url')
      .whereRaw('date >= CURRENT_DATE')
      .whereNotNull('country_code')
      .whereNotNull('source')
      .whereNotNull('source_url')
      .orderBy('source', 'asc')

    const groupedSources = new Map()

    for (const row of rows) {
      if (!groupedSources.has(row.country_code)) {
        groupedSources.set(row.country_code, [])
      }

      groupedSources.get(row.country_code).push({
        name: row.source,
        url: row.source_url,
      })
    }

    return Array.from(groupedSources, ([code, sources]) => ({
      code,
      name: getCountryName(code),
      sources,
    })).sort((left, right) => left.name.localeCompare(right.name, 'en'))
  } catch (error) {
    console.error('Error fetching sources:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch sources',
    })
  }
})
