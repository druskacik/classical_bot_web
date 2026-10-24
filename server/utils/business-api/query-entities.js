import { fail, parseCountryCode, parseId, positiveInteger } from './contract.js'
import { normalizeSearchText, normalizedLikePattern } from '../../../layers/concerts/server/utils/search-text.js'

export const entityKinds = ['cities', 'performers', 'venues']
export function parseEntityInput(kind, query) {
  if (!entityKinds.includes(kind)) throw new Error('Invalid entity kind')
  const allowed = new Set(['q', 'page', 'page_size', 'has_upcoming',
    ...(kind === 'performers' ? [] : ['country_code']), ...(kind === 'venues' ? ['city_id'] : [])])
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.has(key) || typeof value !== 'string') throw fail(400, 'invalid_parameter', `Invalid parameter: ${key}`)
  }
  if (!query.q?.trim() || query.q.length > 200 || !normalizeSearchText(query.q)) throw fail(400, 'invalid_parameter', 'q is required and must contain searchable text (maximum 200 characters).')
  if (query.has_upcoming !== undefined && !['true', 'false'].includes(query.has_upcoming)) throw fail(400, 'invalid_parameter', 'has_upcoming must be true or false.')
  return { q: query.q.trim(), country_code: parseCountryCode(query.country_code), city_id: parseId(query.city_id, 'city_id'),
    has_upcoming: query.has_upcoming === 'true', page: positiveInteger(query.page, 1, 1000000), pageSize: positiveInteger(query.page_size, 20, 100) }
}

export function entityParams(input) {
  return { q: input.q, ...(input.country_code ? { country_code: input.country_code } : {}),
    ...(input.city_id ? { city_id: input.city_id } : {}), has_upcoming: String(input.has_upcoming) }
}

// PostgreSQL's built-in Unicode normalization avoids requiring an unaccent
// extension/migration. City names do not have a stored normalized column.
const fold = value => value.normalize('NFKD').toLowerCase().replaceAll('ß', 'ss').replace(/\p{M}/gu, '')
const foldedColumn = (db, column) => db.raw("replace(regexp_replace(normalize(lower(COALESCE(??, '')), NFKD), '[\u0300-\u036f]', '', 'g'), 'ß', 'ss')", [column])

function matchingEntities(db, kind, input) {
  const table = { cities: 'city', performers: 'performer', venues: 'venue' }[kind]
  const text = kind === 'cities' ? fold(input.q) : normalizeSearchText(input.q)
  const pattern = normalizedLikePattern(text)
  const prefix = pattern.slice(1)
  let names
  if (kind === 'cities') {
    names = db('city').select('id as entity_id', foldedColumn(db, 'english_name').wrap('', ' AS search_name'))
      .unionAll(db('city').select('id as entity_id', foldedColumn(db, 'local_name').wrap('', ' AS search_name')))
  } else {
    names = db(table).select('id as entity_id', 'normalized_name as search_name')
      .unionAll(db(`${table}_alias`).select(`${table}_id as entity_id`, 'normalized_alias as search_name'))
  }
  const ranked = db.from(names.as('names')).where('search_name', 'like', pattern).groupBy('entity_id')
    .select('entity_id', db.raw('min(CASE WHEN search_name = ? THEN 0 WHEN search_name LIKE ? THEN 1 ELSE 2 END) AS rank', [text, prefix]))
  const query = db(`${table} as e`).join(ranked.as('match'), 'match.entity_id', 'e.id')
  if (kind === 'venues') query.leftJoin('city as city', 'city.id', 'e.city_id').leftJoin('venue as parent', 'parent.id', 'e.parent_venue_id')
  if (input.country_code) {
    if (kind === 'venues') query.whereRaw('COALESCE(e.country_code, city.country_code) = ?', [input.country_code])
    else query.where('e.country_code', input.country_code)
  }
  if (input.city_id) query.where('e.city_id', input.city_id)
  if (input.has_upcoming) {
    const upcoming = db('serving.current_concert as cc').select(1).whereRaw('cc.date >= CURRENT_DATE')
    if (kind === 'performers') upcoming.join('serving.current_concert_performer as p', 'p.concert_id', 'cc.id').whereRaw('p.performer_id = e.id')
    else upcoming.whereRaw(kind === 'cities' ? 'cc.city_id = e.id' : 'cc.venue_id = e.id')
    query.whereExists(upcoming)
  }
  return query
}

const id = value => value == null ? null : String(value)
export async function queryEntitySnapshot(db, kind, input) {
  const scope = () => matchingEntities(db, kind, input)
  const { total: count } = await scope().count('* as total').first()
  const total = Number(count)
  const query = scope().orderBy('match.rank').orderBy(kind === 'cities' ? db.raw('COALESCE(e.english_name, e.local_name)') : 'e.name').orderBy('e.id')
    .limit(input.pageSize).offset((input.page - 1) * input.pageSize)
  let items
  if (kind === 'cities') {
    const rows = await query.select('e.id', 'e.english_name', 'e.local_name', 'e.country_code', 'e.latitude', 'e.longitude', 'e.external_source', 'e.external_id')
    items = rows.map(row => ({ id: id(row.id), name: row.english_name || row.local_name, local_name: row.local_name,
      country_code: row.country_code, latitude: row.latitude, longitude: row.longitude, external_source: row.external_source, external_id: row.external_id }))
  } else if (kind === 'performers') {
    const rows = await query.select('e.id', 'e.name', 'e.kind', 'e.ensemble_type', 'e.identity_url')
    items = rows.map(row => ({ ...row, id: id(row.id) }))
  } else {
    const rows = await query.select('e.id', 'e.name', 'e.address', 'e.identity_url', 'e.latitude', 'e.longitude',
      'e.city_id', 'city.english_name', 'city.local_name', 'city.country_code as city_country_code',
      db.raw('COALESCE(e.country_code, city.country_code) AS country_code'), 'e.parent_venue_id', 'parent.name as parent_venue_name')
    items = rows.map(row => ({ id: id(row.id), name: row.name, country_code: row.country_code,
      city: row.city_id == null ? null : { id: id(row.city_id), name: row.english_name || row.local_name, country_code: row.city_country_code },
      address: row.address, identity_url: row.identity_url, latitude: row.latitude, longitude: row.longitude,
      parent_venue: row.parent_venue_id == null ? null : { id: id(row.parent_venue_id), name: row.parent_venue_name } }))
  }
  return { items, pagination: { page: input.page, page_size: input.pageSize, total, total_pages: Math.ceil(total / input.pageSize), next: null }, generated_at: new Date().toISOString() }
}
