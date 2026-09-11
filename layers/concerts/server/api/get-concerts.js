import { concertFilterCacheInput } from '../utils/data-cache-keys.js'
import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertSite } from '#concert-site'
import knex from '../utils/connection.js'
import { applyFilters, parseConcertFilters, parsePage } from '../utils/concert-filters.js'
import { getCityCatalogue } from '../utils/city-catalogue.js'

const PAGE_SIZE = 50
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const page = parsePage(query.page)
    const filters = parseConcertFilters(query, concertSite.country)
    const { city } = filters

    return await cachedConcertData('concerts', { filters: concertFilterCacheInput(filters), page }, async () => {
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

      const [countRow, concerts, catalogue] = await Promise.all([countQuery, itemQuery, getCityCatalogue()])
      const total = Number(countRow.total)
      if (city?.id && page > Math.max(1, Math.ceil(total / PAGE_SIZE))) {
        throw createError({ statusCode: 404, statusMessage: 'Concert page not found' })
      }
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

      return {
        items: concerts.map(concert => ({
          ...concert,
          city_path: (catalogue.byId.get(String(concert.city_id)) || (concertSite.cityRoutes === 'local' ? catalogue.byPath.get(`/${concert.city}`) : null))?.path || null,
          ...(concertSite.cityRoutes === 'local' ? { city: catalogue.byId.get(String(concert.city_id))?.name || concert.city } : {}),
          title: concert.title.replace(/\s+/g, ' '),
          composers: composersByConcert[concert.id] || [],
        })),
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: total ? Math.ceil(total / PAGE_SIZE) : 0,
      }
    })
  } catch (error) {
    if (error.statusCode) throw error

    console.error('Error fetching concerts:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch concerts',
    })
  }
})
