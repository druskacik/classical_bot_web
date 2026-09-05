import { getCountryPath } from './countries.js'

export const cleanConcertQuery = query => Object.fromEntries(
  Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
)

export const updateConcertQuery = (query, changes) => cleanConcertQuery({
  ...query,
  ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [
    key, Array.isArray(value) ? value.join(',') : value,
  ])),
  ...(Object.hasOwn(changes, 'country') && !Object.hasOwn(changes, 'city') ? { city: undefined } : {}),
  ...((Object.hasOwn(changes, 'dateFrom') || Object.hasOwn(changes, 'dateTo')) && !Object.hasOwn(changes, 'datePreset') ? { datePreset: undefined } : {}),
  page: undefined,
})

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
  const value = Array.isArray(route.query.composers) ? route.query.composers[0] : route.query.composers
  const selected = typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : []
  return { path: route.path, query: updateConcertQuery(route.query, { composers: [...new Set([...selected, composer])] }) }
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
