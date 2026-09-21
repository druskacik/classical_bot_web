import { cleanConcertQuery, updateConcertQuery, normalizeConcertQuery, serializeConcertQuery, querySelections, selectionQuery, hasCoordinateQuery } from '../../shared/utils/concert-query.js'
import { clearAreaQuery, hasAreaQuery, areaQuery } from '../../shared/utils/concert-area.js'
import { getCountryPath } from './countries.js'

export { cleanConcertQuery, updateConcertQuery } from '../../shared/utils/concert-query.js'

export const concertCityLocation = (query, concert) => ({
  // Fallback cities must leave fixed-location routes so their query takes effect.
  path: concert.city_path || '/',
  query: updateConcertQuery(query, {
    country: concert.city_path ? undefined : concert.country_code,
    city: concert.city_path ? undefined : (concert.country_code ? `${concert.city},${concert.country_code}` : concert.city),
  }),
})

export const concertCountryLocation = (query, country) => ({
  path: getCountryPath(country) || '/',
  query: updateConcertQuery(query, { country: undefined, city: undefined }),
})

export const concertComposerLocation = (route, composer) => {
  const selected = querySelections(route.query.composers)
  return { path: route.path, query: updateConcertQuery(route.query, { composers: [...new Set([...selected, composer])] }) }
}

export const concertWorkLocation = (route, workId) => {
  const selected = querySelections(route.query.works)
  const works = [...new Set([...selected.map(Number), Number(workId)])]
    .filter(id => Number.isSafeInteger(id) && id > 0)
  return { path: route.path, query: updateConcertQuery(route.query, { works }) }
}

const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const concertDatePreset = (preset, now = new Date()) => {
  if (preset === 'any') return { dateFrom: null, dateTo: null }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const end = new Date(start)
  if (preset === 'week') end.setDate(end.getDate() + (7 - start.getDay()) % 7)
  if (preset === 'weekend') {
    const day = start.getDay()
    const daysUntilSaturday = day === 0 ? 0 : 6 - day
    start.setDate(start.getDate() + daysUntilSaturday)
    // Clone after advancing start to handle month/year boundaries.
    end.setTime(start.getTime())
    if (day !== 0) end.setDate(end.getDate() + 1)
  }
  return { dateFrom: localDate(start), dateTo: localDate(end) }
}

// Explicit dates remain authoritative; preset metadata only controls the label.
export const resolveConcertDateMode = (preset, from, to, now) => {
  if (!from && !to) return 'any'
  if (now && ['today', 'week', 'weekend'].includes(preset)) {
    const range = concertDatePreset(preset, now)
    if (range.dateFrom === from && range.dateTo === to) return preset
  }
  return 'custom'
}

export const formatConcertDateRange = (from, to, locale = 'en-GB', labels = { from: 'From', until: 'Until' }) => {
  const format = value => {
    const date = new Date(`${value}T12:00:00Z`)
    return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
  }
  if (!from && !to) return ''
  if (from && to) return from === to ? format(from) : `${format(from)} – ${format(to)}`
  return from ? `${labels.from} ${format(from)}` : `${labels.until} ${format(to)}`
}

export const concertAreaLocation = (query, area) => ({
  path: '/',
  query: updateConcertQuery(query, { city: undefined, country: undefined, ...clearAreaQuery(), ...areaQuery(area) }),
})
// A radius alone may get its origin from the city page. Keep that route until
// an explicit city or coordinate origin makes the search self-contained.
export const normalizeAreaLocation = (path, query) => hasAreaQuery(query) && (Boolean(query.city) || hasCoordinateQuery(query)) && path !== '/map' && (path !== '/' || query.country !== undefined)
  ? { path: '/', query: cleanConcertQuery({ ...query, country: undefined, page: undefined }) }
  : null

// Location controls leave fixed city/country routes; music and dates travel with them.
export const cityRadiusLocation = (query, city, radius = 0) => ({
  path: '/',
  query: updateConcertQuery(query, {
    ...clearAreaQuery(), city: city || undefined, country: undefined,
    radius: city && Number(radius) > 0 ? String(radius) : undefined,
  }),
})

// Marker identity stays separate from the public city filter.
export const mapSelectionQuery = input => selectionQuery(normalizeConcertQuery(input))
export const normalizeMapQuery = input => serializeConcertQuery({ ...normalizeConcertQuery(input), country: undefined })
export const concertMapLocation = (query, city) => ({
  path: '/map', query: normalizeMapQuery({ ...query, city: city || undefined, page: undefined }),
})
export const mapListLocation = input => {
  const query = normalizeConcertQuery(input)
  const selection = selectionQuery(query)
  return { path: '/', query: serializeConcertQuery({
    ...Object.fromEntries(['dateFrom', 'dateTo', 'datePreset', 'composers', 'works'].map(key => [key, query[key]])),
    ...(Object.keys(selection).length ? selection : { bounds: query.bounds }),
  }) }
}
