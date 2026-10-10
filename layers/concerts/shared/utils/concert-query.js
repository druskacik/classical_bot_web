// Query syntax only. Semantic validation remains on the server.
export const firstQueryValue = value => Array.isArray(value) ? value[0] : value
export const querySelections = value => typeof firstQueryValue(value) === 'string'
  ? [...new Set(firstQueryValue(value).split(',').map(item => item.trim()).filter(Boolean))] : []
const cleanSelections = values => [...new Set(values.map(value => value.trim()).filter(Boolean))]

// Composer names use CSV quoting; numeric work IDs keep their existing syntax.
// Invalid quoting falls back for the whole input, preserving legacy URLs.
export function composerSelections(value) {
  const text = firstQueryValue(value)
  if (typeof text !== 'string') return []
  const fields = []
  let index = 0
  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index])) index++
    let field = ''
    if (text[index] === '"') {
      index++
      let closed = false
      while (index < text.length) {
        const character = text[index++]
        if (character !== '"') field += character
        else if (text[index] === '"') { field += '"'; index++ }
        else { closed = true; break }
      }
      while (index < text.length && /\s/.test(text[index])) index++
      if (!closed || (index < text.length && text[index] !== ',')) return querySelections(text)
    } else {
      while (index < text.length && text[index] !== ',') field += text[index++]
    }
    fields.push(field)
    index++
  }
  return cleanSelections(fields)
}

export const serializeComposerSelections = values => cleanSelections(values)
  .map(value => /[,"\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value).join(',')

export const cleanConcertQuery = query => Object.fromEntries(Object.entries(query)
  .filter(([, value]) => value !== undefined && value !== null && value !== ''))
const scalarKeys = ['country', 'city', 'nearLat', 'nearLng', 'radius', 'bounds', 'dateFrom', 'dateTo', 'datePreset', 'page']
export function normalizeConcertQuery(input) {
  const query = { ...input }
  for (const key of scalarKeys) if (query[key] !== undefined) query[key] = firstQueryValue(query[key])
  if (query.composers !== undefined) query.composers = serializeComposerSelections(composerSelections(query.composers))
  if (query.works !== undefined) query.works = querySelections(query.works).join(',')
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
    ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, Array.isArray(value) ? (key === 'composers' ? serializeComposerSelections(value) : value.join(',')) : value])),
    ...((Object.hasOwn(changes, 'dateFrom') || Object.hasOwn(changes, 'dateTo')) && !Object.hasOwn(changes, 'datePreset') ? { datePreset: undefined } : {}),
    ...(resetPage ? { page: undefined } : {}),
  })
}

// Filters shared by map markers, programme results, and music facets.
export const mapFilterQuery = query => cleanConcertQuery({ country: query.country, ...musicQuery(query) })
