import { fail, MAX_EXPORT_ROWS } from './contract.js'
import { lookupSource } from './source-lookup.js'
import { serializeConcert } from './serialize-concert.js'
import { withServingSnapshot } from '../../../layers/concerts/server/utils/serving-catalogue.js'

export async function queryConcerts(db, input) {
  const source = input.url ? await lookupSource(db, input.url) : null
  return withServingSnapshot(db, trx => queryConcertSnapshot(trx, input, source))
}

// EXISTS keeps performer/source relationships from multiplying concerts or counts.
export function applyConcertFilters(query, trx, input, resolved) {
  if (resolved) query.whereExists(trx('serving.current_occurrence as o').select(1)
    .whereRaw('o.concert_id=cc.id').whereRaw('o.date>=CURRENT_DATE').whereIn('o.normalized_url', resolved.aliases))
  if (input.country_code) query.whereRaw('COALESCE(cc.country_code_resolved, cc.country_code_raw) = ?', [input.country_code])
  if (input.city_id) query.where('cc.city_id', input.city_id)
  if (input.venue_id) query.where('cc.venue_id', input.venue_id)
  if (input.performer_id) query.whereExists(trx('serving.current_concert_performer as p').select(1)
    .whereRaw('p.concert_id=cc.id').where('p.performer_id', input.performer_id))
  return query
}

// Attribute unscoped results individually, never to an arbitrary source from the
// request. Resolve exact occurrence URLs in one batch; ambiguous/unregistered
// URLs retain their stored label/URL with a null registry ID.
async function occurrenceSources(trx, occurrences) {
  const urls = [...new Set(occurrences.map(o => o.normalized_url).filter(Boolean))]
  if (!urls.length) return new Map()
  const rows = await trx('serving.source_url as u')
    .join('serving.registry_state as state', 'state.revision', 'u.revision')
    .join('serving.source_registry as r', function () {
      this.on('r.revision', '=', 'u.revision').andOn('r.id', '=', 'u.root_id')
    })
    .whereIn('u.normalized_url', urls).distinct('u.normalized_url', 'u.root_id', 'r.canonical_url')
  const grouped = new Map()
  for (const row of rows) grouped.set(row.normalized_url, [...(grouped.get(row.normalized_url) || []), row])
  return new Map([...grouped].filter(([, matches]) => matches.length === 1).map(([url, [row]]) =>
    [url, { id: String(row.root_id), url: row.canonical_url }]))
}

export async function queryConcertSnapshot(trx, input, preparedSource) {
  const resolved = input.url ? preparedSource || await lookupSource(trx, input.url) : null
  const scope = () => applyConcertFilters(trx('serving.current_concert as cc').whereRaw('cc.date>=CURRENT_DATE'), trx, input, resolved)
  const count = await scope().count('* as total').first()
  const total = Number(count.total)
  if (input.all && total > MAX_EXPORT_ROWS) throw fail(422, 'export_too_large', 'Export exceeds 10000 concerts; use pagination.')
  let source = null
  if (resolved) {
    const summary = await trx('serving.source_summary').whereRaw('generation_id=serving.pinned_generation()')
      .whereIn('normalized_url', resolved.aliases).orderBy('member_date', 'desc').orderBy('member_id', 'desc').first('source')
    source = { id: resolved.id, url: resolved.url, name: summary?.source?.trim() || new URL(resolved.url).hostname }
  }
  const page = await scope().select('cc.id').orderBy('cc.date').orderByRaw('cc.time_from ASC NULLS LAST').orderBy('cc.id')
    .limit(input.all ? MAX_EXPORT_ROWS : input.pageSize).offset(input.all ? 0 : (input.page - 1) * input.pageSize)
  const ids = page.map(row => row.id)
  const docs = ids.length ? await trx('serving.current_document as d').whereIn('d.concert_id', ids)
    .leftJoin('city as city', 'city.id', trx.raw("(d.scalar->>'city_id')::bigint"))
    .leftJoin('venue as parent', 'parent.id', trx.raw("(d.scalar->'venue_details'->>'parent_venue_id')::bigint"))
    .select('d.*', 'city.english_name', 'city.local_name', 'parent.name as parent_venue_name') : []
  const occurrences = ids.length ? await trx('serving.current_occurrence').whereIn('concert_id', ids)
    .modify(query => { if (resolved) query.whereIn('normalized_url', resolved.aliases) })
    .select('concert_id', 'member_id', 'event_url', 'source', 'source_url', 'normalized_url')
    .orderByRaw('(member_id = concert_id) DESC').orderBy('member_id') : []
  const sources = resolved ? new Map() : await occurrenceSources(trx, occurrences)
  const byConcert = new Map()
  for (const occurrence of occurrences) byConcert.set(String(occurrence.concert_id), [...(byConcert.get(String(occurrence.concert_id)) || []), occurrence])
  const ensembleIds = [...new Set(docs.flatMap(d => d.performers.map(p => p.ensemble_id)).filter(Boolean))]
  const ensembles = new Map((ensembleIds.length ? await trx('performer').whereIn('id', ensembleIds).select('id', 'name') : []).map(p => [String(p.id), p.name]))
  const byId = new Map(docs.map(d => [String(d.concert_id), d]))
  const concerts = ids.map(id => {
    const d = byId.get(String(id)), s = d.scalar, v = s.venue_details || {}
    const links = byConcert.get(String(id)) || []
    const preferred = links[0]
    const identity = sources.get(preferred?.normalized_url)
    const attribution = source || { id: identity?.id ?? null, name: preferred?.source?.trim() || null, url: identity?.url || preferred?.source_url || null }
    const row = { ...s, city: d.english_name || d.local_name || s.city_raw, country_code: s.country_code_resolved || s.country_code_raw,
      venue_name: v.name, venue_address: v.address, venue_url: v.identity_url, latitude: v.latitude, longitude: v.longitude, parent_venue_name: d.parent_venue_name }
    return serializeConcert(row, attribution, { performers: d.performers.map(p => ({ ...p, ensemble_name: ensembles.get(String(p.ensemble_id)) || null })),
      works: d.works, composers: d.composers, prices: d.prices,
      sourceUrls: [...new Set(links.map(o => o.event_url).filter(Boolean))].sort() })
  })
  return { source, concerts, pagination: { page: input.all ? null : input.page, page_size: input.all ? null : input.pageSize, total, total_pages: input.all ? null : Math.ceil(total / input.pageSize), all: input.all }, generated_at: new Date().toISOString() }
}
