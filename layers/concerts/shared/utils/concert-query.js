// Query syntax only. Semantic validation remains on the server.
export const firstQueryValue = value => Array.isArray(value) ? value[0] : value
export const querySelections = value => typeof firstQueryValue(value) === 'string'
  ? [...new Set(firstQueryValue(value).split(',').map(item => item.trim()).filter(Boolean))] : []
export const cleanConcertQuery = query => Object.fromEntries(Object.entries(query)
  .filter(([, value]) => value !== undefined && value !== null && value !== ''))
const scalarKeys = ['country', 'city', 'nearLat', 'nearLng', 'radius', 'bounds', 'dateFrom', 'dateTo', 'datePreset', 'page']
export function normalizeConcertQuery(input) {
  const query = { ...input }
  for (const key of scalarKeys) if (query[key] !== undefined) query[key] = firstQueryValue(query[key])
  for (const key of ['composers', 'works']) if (query[key] !== undefined) query[key] = querySelections(query[key]).join(',')
  return query
}

export function serializeConcertQuery(input) {
  const query = normalizeConcertQuery(input)
  if (String(query.page) === '1') delete query.page
  if (String(query.radius) === '0' && query.nearLat === undefined && query.nearLng === undefined) delete query.radius
  return cleanConcertQuery(query)
}
export const clearLocationQuery = () => ({ city: undefined, radius: undefined, nearLat: undefined, nearLng: undefined })
export const hasCoordinateQuery = query => query.nearLat !== undefined || query.nearLng !== undefined
export const hasRadiusQuery = query => hasCoordinateQuery(query) || Number(query.radius) > 0
export const selectionQuery = query => cleanConcertQuery(Object.fromEntries(['city', 'nearLat', 'nearLng', 'radius'].map(key => [key, query[key]])))
export const musicQuery = query => cleanConcertQuery(Object.fromEntries(['dateFrom', 'dateTo', 'composers', 'works'].map(key => [key, query[key]])))

export function updateConcertQuery(input, changes, { resetPage = true, clearBounds = true } = {}) {
  const query = normalizeConcertQuery(input)
  const locationChanged = Object.hasOwn(changes, 'city') || Object.hasOwn(changes, 'country') || hasCoordinateQuery(changes)
  return serializeConcertQuery({
    ...query,
    ...(locationChanged ? { ...clearLocationQuery(), ...(clearBounds ? { bounds: undefined } : {}) } : {}),
    ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value])),
    ...((Object.hasOwn(changes, 'dateFrom') || Object.hasOwn(changes, 'dateTo')) && !Object.hasOwn(changes, 'datePreset') ? { datePreset: undefined } : {}),
    ...(resetPage ? { page: undefined } : {}),
  })
}
