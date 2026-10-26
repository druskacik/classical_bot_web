// @ts-check
import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertFilterCacheInput } from '../utils/data-cache-keys.js'
import { concertSite } from '#concert-site'
import { prepareFilterOptions } from '../utils/filter-options/request.js'
import { loadCountryOptions } from '../utils/filter-options/country.js'
import { loadCityOptions } from '../utils/filter-options/city.js'
import { loadMusicOptions } from '../utils/filter-options/music.js'
import { assembleFilterOptions } from '../utils/filter-options/response.js'

export default defineEventHandler(async (event) => {
  try {
    const request = await prepareFilterOptions(getQuery(event), concertSite)
    const { type, context, search, selected, includeUnavailable } = request
    return await cachedConcertData('filter-options', {
      type, filters: concertFilterCacheInput(context), search, selected, includeUnavailable,
    }, async (/** @type {import('knex').Knex.Transaction} */ db) => {
      const input = { db, request, site: concertSite }
      const loaded = type === 'country' ? await loadCountryOptions(input)
        : type === 'city' ? await loadCityOptions(input) : await loadMusicOptions(input)
      return assembleFilterOptions(request, loaded)
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode) throw error
    console.error('Error fetching concert filter options:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch filter options' })
  }
})
