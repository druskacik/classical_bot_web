import { cleanConcertQuery, updateConcertQuery, normalizeConcertQuery, serializeConcertQuery, composerSelections, querySelections, selectionQuery, hasCoordinateQuery } from '../../shared/utils/concert-query.js'
import { clearAreaQuery, hasAreaQuery, areaQuery } from '../../shared/utils/concert-area.js'
import { getCountryPath, getCountryName } from './countries.js'
import { subjectListingPath } from '../../shared/utils/subject-discovery.js'

export { cleanConcertQuery, updateConcertQuery } from '../../shared/utils/concert-query.js'

const subjectContextKeys = ['country', 'city', 'nearLat', 'nearLng', 'radius', 'bounds', 'dateFrom', 'dateTo', 'datePreset']

// Replace the music selection, preserving where and when the listener is searching.
export const subjectDiscoveryLocation = (route, subject) => {
  const path = route.path?.replace(/\/+$/, '') || '/'
  // The map's selected city/area takes precedence over its viewport, just as
  // it does for the displayed programme and the ordinary list-navigation link.
  const query = path === '/map' ? mapListLocation(route.query || {}).query : route.query || {}
  const context = serializeConcertQuery(Object.fromEntries(subjectContextKeys.map(key => [key, query[key]])))
  const suffix = new URLSearchParams(context).toString()
  return subjectListingPath(path === '/map' ? '/' : path, subject) + (suffix ? `&${suffix}` : '')
}

// Broadening is explicit. A radius/map area or unresolved query city must not
// silently become a fixed-city search; those links clearly lead worldwide.
export const broaderSubjectLocation = (route, subject, { cityPage, countryCode, canonicalPath } = {}) => {
  const query = route.query || {}
  if (!subjectContextKeys.some(key => query[key] !== undefined && query[key] !== '')) return null
  const area = hasAreaQuery(query) || Boolean(query.bounds)
  let path = '/', phrase = 'worldwide'
  if (!area && cityPage) {
    path = cityPage.path
    phrase = `in ${cityPage.name}, ${cityPage.countryName}`
  } else if (!area && !query.city) {
    const country = countryCode || query.country
    const countryPath = getCountryPath(country)
    if (countryPath) {
      path = canonicalPath || countryPath
      phrase = `in ${getCountryName(country)}`
    }
  }
  const label = subject.type === 'composer' ? `${subject.name} concerts`
    : `performances of ${subject.composerName}: ${subject.title}`
  return { href: subjectListingPath(path, subject), label: `See all upcoming ${label} ${phrase}` }
}

export const concertCityLocation = (query, concert) => ({
  // Fallback cities must leave fixed-location routes so their query takes effect.
  path: concert.city_path || '/',
  query: updateConcertQuery(query, {
    // City values include their country; a separate country filter excludes unresolved events.
    country: undefined,
    city: concert.city_path ? undefined : (concert.country_code ? `${concert.city},${concert.country_code}` : concert.city),
  }),
})

export const concertCountryLocation = (query, country) => ({
  path: getCountryPath(country) || '/',
  query: updateConcertQuery(query, { country: undefined, city: undefined }),
})

export const concertComposerLocation = (route, composer) => {
  const selected = composerSelections(route.query.composers)
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
export const normalizeMapQuery = input => serializeConcertQuery(normalizeConcertQuery(input))
export const concertMapLocation = (query, city, country = query.country) => ({
  path: '/map', query: normalizeMapQuery({ ...query, country: hasAreaQuery(query) ? undefined : country || undefined, city: city || undefined, page: undefined }),
})
export const mapListLocation = input => {
  const query = normalizeConcertQuery(input)
  const selection = selectionQuery(query)
  return { path: '/', query: serializeConcertQuery({
    ...Object.fromEntries(['country', 'dateFrom', 'dateTo', 'datePreset', 'composers', 'works'].map(key => [key, query[key]])),
    ...(Object.keys(selection).length ? selection : { bounds: query.bounds }),
  }) }
}
