import { createError } from 'h3'

export const resolvedViews = ['resolved_concert', 'resolved_concert_member', 'resolved_concert_source_url', 'resolved_concert_performer', 'resolved_concert_work', 'resolved_concert_composer', 'resolved_concert_ticket_price']
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Concert catalogue temporarily unavailable' })

// Check before touching a materialization: an installed view may still be unpopulated.
// Failure/staleness after publication does not discard the last successful dataset.
export async function resolvedPublication(db) {
  const { rows } = await db.raw(`SELECT name, c.relkind = 'm' AND c.relispopulated AS populated,
    has_table_privilege(c.oid, 'SELECT') AS readable
    FROM unnest(?::text[]) names(name) LEFT JOIN pg_class c ON c.oid = to_regclass(name)`,
  [[...resolvedViews, 'resolved_concert_refresh_state']])
  if (rows.length !== resolvedViews.length + 1 || rows.some(row => !row.readable || (resolvedViews.includes(row.name) && !row.populated))) throw unavailable()
  const state = await db('resolved_concert_refresh_state').first('published_at')
  if (!state?.published_at) throw unavailable()
  const publishedAt = new Date(state.published_at).toISOString()
  return { publishedAt, stale: Date.now() - new Date(publishedAt).valueOf() > 45 * 60_000 }
}

export function withResolvedSnapshot(db, load) {
  return db.transaction(async trx => load(trx, await resolvedPublication(trx)), {
    isolationLevel: 'repeatable read', readOnly: true,
  })
}

// Only the legacy display fields use a single source. Coverage/matching must use
// all eligible members instead. The sources array is already eligibility-filtered.
export function displaySource(db, field, alias = 'cc') {
  if (!['source', 'source_url'].includes(field)) throw new Error('Invalid display source field')
  return db.raw(`(SELECT entry->>? FROM jsonb_array_elements(??.sources) entry
    ORDER BY (entry->>'concert_id')::bigint = ??.id DESC,
      (entry->>'concert_id')::bigint LIMIT 1) AS ??`, [field, alias, alias, field])
}

// Narrow snapshot adapters keep serializers independent of the storage layout.
// Never join live identity rows in place of published relationship metadata.
export function concertComposers(db, ids) {
  return db('resolved_concert_composer as rc').whereIn('rc.concert_id', ids)
    .select('rc.concert_id as classical_concert_id', 'rc.composer_id as id', db.raw("rc.composer->>'name' as name"))
    .orderBy('name').orderBy('rc.composer_id')
}
export function concertWorks(db, ids) {
  return db('resolved_concert_work as rw')
    .leftJoin('resolved_concert_composer as rc', function () { this.on('rc.concert_id', 'rw.concert_id').andOn('rc.composer_id', 'rw.composer_id') })
    .whereIn('rw.concert_id', ids)
    .select('rw.concert_id as classical_concert_id', 'rw.work_id as id', 'rw.composer_id', 'rw.programme_label',
      db.raw("rw.work->>'title' as title"), db.raw("rw.work->>'catalogue_number' as catalogue_number"), db.raw("rc.composer->>'name' as composer_name"))
    .orderBy('composer_name').orderBy('title').orderBy('rw.work_id')
}
export function concertPerformers(db, ids) {
  return db('resolved_concert_performer as rp')
    // Ensemble names are optional live registry enrichment, not resolved credits.
    .leftJoin('performer as ensemble', 'ensemble.id', 'rp.ensemble_id')
    .whereIn('rp.concert_id', ids)
    .select('rp.concert_id as classical_concert_id', 'rp.performer_id as id', 'rp.roles', 'rp.instruments', 'rp.voice_type', 'rp.character_name', 'rp.ensemble_id', 'rp.qualifier', 'ensemble.name as ensemble_name',
      ...['name', 'kind', 'identity_url'].map(field => db.raw('rp.performer->>? as ??', [field, field])))
    .orderBy('rp.display_order').orderBy('rp.performer_id')
}
export function concertPrices(db, ids) {
  return db('resolved_concert_ticket_price as rp').whereIn('rp.concert_id', ids)
    .select('rp.concert_id as classical_concert_id', 'rp.offer_id as id',
      ...['kind', 'price_type', 'amount', 'amount_max', 'currency', 'category', 'audience', 'conditions', 'basis']
        .map(field => db.raw('rp.offer->>? as ??', [field, field])))
    .orderBy('rp.offer_id')
}
