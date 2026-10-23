import { buildCityIdentities, resolveCitySelection } from '../../shared/utils/city-identity.js'
import { getAreaCities, getIdentityCities } from '../utils/area-cities.js'
import { resolveArea, publicArea } from '../utils/concert-area.js'
import { concertFilterCacheInput } from '../utils/data-cache-keys.js'
import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertSite } from '#concert-site'
import { displaySource, concertComposers, concertWorks } from '../utils/serving-catalogue.js'
import { applyFilters, parseConcertFilters, parsePage } from '../utils/concert-filters.js'
import { getCityCatalogue } from '../utils/city-catalogue.js'
import { groupConcertWorks } from '../utils/concert-works.js'
import { resolveDiscoverySubject } from '../utils/subject-discovery.js'
import { resolveConcertDisplayCity } from '../utils/concert-display-city.js'

const PAGE_SIZE = 50
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const page = parsePage(query.page)
    const filters = parseConcertFilters(query, concertSite.country)
    if (filters.city) filters.city = resolveCitySelection(filters.city, buildCityIdentities(await getIdentityCities()))
    if (filters.area) filters.area = resolveArea(filters.area, await getAreaCities(), concertSite.locale)

    return await cachedConcertData('concerts', { filters: concertFilterCacheInput(filters), page }, async (knex) => {
      const countQuery = applyFilters(
        knex('serving.current_concert as cc')
          .leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id')
          .count('* as total')
          .first(),
        filters,
      )
      const itemQuery = applyFilters(
        knex('serving.current_concert as cc')
          .leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id')
          .select(
            'cc.id',
            'cc.url',
            'cc.title',
            // Preserve the calendar date before pg can interpret it in the server timezone.
            // Keep the existing UTC-midnight API representation for compatibility.
            knex.raw("to_char(cc.date, 'YYYY-MM-DD') || 'T00:00:00.000Z' as date"),
            'cc.time_from',
            'cc.time_to',
            'cc.city_id',
            knex.raw('COALESCE(canonical_city.english_name, canonical_city.local_name, cc.city_raw) as city'),
            knex.raw('COALESCE(cc.country_code_resolved, cc.country_code_raw) as country_code'),
            displaySource(knex, 'source'),
            displaySource(knex, 'source_url'),
            'cc.venue',
          ),
        filters,
      )
        .orderBy('cc.date', 'asc')
        .orderByRaw('cc.time_from ASC NULLS LAST')
        .orderBy('cc.id', 'asc')
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE)

      const [countRow, concerts, catalogue, discovery, displayCity] = await Promise.all([
        countQuery, itemQuery, getCityCatalogue(knex),
        concertSite.subjectDiscovery ? resolveDiscoverySubject(knex, filters) : null,
        concertSite.subjectDiscovery ? resolveConcertDisplayCity(knex, filters.city
          ? { ...filters.city, country: filters.city.country || filters.country } : null, concertSite.locale) : null,
      ])
      const total = Number(countRow.total)
      if (page > Math.max(1, Math.ceil(total / PAGE_SIZE))) {
        throw createError({ statusCode: 404, statusMessage: 'Concert page not found' })
      }
      const concertIds = concerts.map(concert => concert.id)
      const [composerRows, workRows] = await Promise.all([
        concertIds.length
        ? concertComposers(knex, concertIds)
        : [],
        concertIds.length
        ? concertWorks(knex, concertIds)
        : [],
      ])
      const worksByConcert = groupConcertWorks(workRows)

      const composersByConcert = composerRows.reduce((groups, composer) => {
        const id = composer.classical_concert_id
        if (!groups[id]) groups[id] = []
        groups[id].push({ id: composer.id, name: composer.name })
        return groups
      }, {})

      return {
        ...(discovery ? { discovery } : {}),
        ...(displayCity ? { displayCity } : {}),
        items: concerts.map(concert => ({
          ...concert,
          city_path: (catalogue.byId.get(String(concert.city_id)) || (concertSite.cityRoutes === 'local' ? catalogue.byPath.get(`/${concert.city}`) : null))?.path || null,
          ...(concertSite.cityRoutes === 'local' ? { city: catalogue.byId.get(String(concert.city_id))?.name || concert.city } : {}),
          title: concert.title?.replace(/\s+/g, ' ') ?? null,
          composers: composersByConcert[concert.id] || [],
          works: worksByConcert.get(String(concert.id)) || [],
        })),
        ...(filters.area ? { area: publicArea(filters.area) } : {}),
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
