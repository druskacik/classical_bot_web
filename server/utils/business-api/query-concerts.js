import { fail, MAX_EXPORT_ROWS } from './contract.js'
import { resolveSource, normalizedSourceUrl } from './resolve-source.js'
import { serializeConcert } from './serialize-concert.js'
import { applyPublicConcertScope } from '../../../layers/concerts/server/utils/public-concerts.js'

export async function queryConcerts(db, input) {
  return db.transaction(async trx => {
    await trx.raw("SET LOCAL statement_timeout = '15s'")
    await trx.raw("SET LOCAL TIME ZONE 'UTC'")
    const sources = await trx('crawler_source').select('id', 'canonical_url', 'duplicate_of_id')
    const aliases = await trx('crawler_source_url').select('crawler_source_id', 'url')
    const resolved = resolveSource(input.url, sources, aliases)
    // Resolve legacy spelling variants in concert provenance without guessing ownership from a hostname.
    const storedUrls = await trx('classical_concert').distinct('source_url').whereNotNull('source_url')
    const accepted = new Set(resolved.aliases)
    const urls = storedUrls.filter(row => accepted.has(normalizedSourceUrl(row.source_url))).map(row => row.source_url)
    const nameRow = urls.length ? await trx('classical_concert').whereIn('source_url', urls)
      .whereNotNull('source').whereRaw("TRIM(source) <> ''").orderBy('date', 'desc').orderBy('id', 'desc').first('source') : null
    const source = { id: resolved.id, name: nameRow?.source?.trim() || new URL(resolved.url).hostname, url: resolved.url }
    // Load each duplicate link once. Batched primary-key lookups avoid repeated recursive
    // scans of the entire concert table for counts, page rows and provenance.
    const origins = await trx('classical_concert').whereIn('source_url', urls).select('id', 'url', 'duplicate_of_id')
    const nodes = new Map(origins.map(row => [row.id, row]))
    const attempted = new Set(nodes.keys())
    let frontier = origins
    while (frontier.length) {
      const missing = [...new Set(frontier.map(row => row.duplicate_of_id).filter(value => value != null && !attempted.has(value)))]
      if (!missing.length) break
      missing.forEach(value => attempted.add(value))
      frontier = await trx('classical_concert').whereRaw('id = ANY(?::int[])', [missing]).select('id', 'duplicate_of_id')
      frontier.forEach(row => nodes.set(row.id, row))
    }
    const sourceUrlsByPrimary = new Map()
    for (const origin of origins) {
      let row = origin
      const seen = new Set()
      while (row?.duplicate_of_id != null && !seen.has(row.id)) {
        seen.add(row.id)
        row = nodes.get(row.duplicate_of_id)
      }
      if (!row || row.duplicate_of_id != null) continue
      if (!sourceUrlsByPrimary.has(row.id)) sourceUrlsByPrimary.set(row.id, new Set())
      sourceUrlsByPrimary.get(row.id).add(origin.url)
    }
    const primaryIds = [...sourceUrlsByPrimary.keys()]
    const scoped = () => trx('classical_concert as cc')
      .modify(applyPublicConcertScope)
      .whereRaw('cc.id = ANY(?::int[])', [primaryIds])
    const count = await scoped().count('* as total').first()
    const total = Number(count.total)
    if (input.all && total > MAX_EXPORT_ROWS) throw fail(422, 'export_too_large', 'Export exceeds 10000 concerts; use pagination.')
    const rows = await scoped()
      .leftJoin('venue as v', 'v.id', 'cc.venue_id')
      .leftJoin('venue as parent', 'parent.id', 'v.parent_venue_id')
      .leftJoin('city as city', 'city.id', trx.raw('COALESCE(v.city_id, cc.city_id)'))
      .select('cc.id', 'cc.title', 'cc.url', 'cc.time_from', 'cc.time_to', 'cc.venue', 'cc.venue_id',
        'cc.buy_url', 'cc.event_status', 'cc.last_verified_at', 'cc.admission_type', 'cc.booking_kind', 'cc.booking_status', 'cc.on_sale_at',
        trx.raw("to_char(cc.date, 'YYYY-MM-DD') as date"),
        trx.raw('COALESCE(city.english_name, city.local_name, cc.city_raw) as city'),
        trx.raw('COALESCE(v.country_code, cc.country_code_resolved, cc.country_code_raw) as country_code'),
        'v.name as venue_name', 'v.address as venue_address', 'v.identity_url as venue_url',
        'v.latitude', 'v.longitude', 'parent.name as parent_venue_name')
      .orderBy('cc.date').orderByRaw('cc.time_from ASC NULLS LAST').orderBy('cc.id')
      .limit(input.all ? MAX_EXPORT_ROWS : input.pageSize).offset(input.all ? 0 : (input.page - 1) * input.pageSize)
    const ids = rows.map(row => row.id)
    const byConcert = list => {
      const map = new Map()
      for (const row of list) {
        const key = String(row.classical_concert_id)
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(row)
      }
      return map
    }
    let performers = [], works = [], composers = [], prices = []
    if (ids.length) {
      performers = await trx('classical_concert_performer as cp').join('performer as p', 'p.id', 'cp.performer_id')
        .leftJoin('performer as ensemble', 'ensemble.id', 'cp.ensemble_id')
        .whereIn('cp.classical_concert_id', ids).select(
          'cp.classical_concert_id', 'cp.roles', 'cp.instruments', 'cp.voice_type', 'cp.character_name', 'cp.ensemble_id', 'cp.qualifier',
          'p.id', 'p.name', 'p.kind', 'p.identity_url', 'ensemble.name as ensemble_name')
        .orderBy('cp.display_order').orderBy('p.id')
      works = await trx('classical_concert_work as cw').join('work as w', 'w.id', 'cw.work_id')
        .join('composer as c', 'c.id', 'w.composer_id').whereIn('cw.classical_concert_id', ids)
        .select('cw.classical_concert_id', 'w.id', 'w.title', 'w.catalogue_number', 'cw.programme_label', 'c.id as composer_id', 'c.name as composer_name')
        .orderBy('c.name').orderBy('w.title').orderBy('w.id')
      composers = await trx('classical_concert_composer as cc').join('composer as c', 'c.id', 'cc.composer_id')
        .whereIn('cc.classical_concert_id', ids).select('cc.classical_concert_id', 'c.id', 'c.name')
      prices = await trx('classical_concert_ticket_price').whereIn('classical_concert_id', ids)
        .select('id', 'classical_concert_id', 'kind', 'price_type', 'amount', 'amount_max', 'currency', 'category', 'audience', 'conditions', 'basis').orderBy('id')
    }
    const groups = [performers, works, composers, prices].map(byConcert)
    return {
      source,
      concerts: rows.map(row => serializeConcert(row, source, {
        performers: groups[0].get(String(row.id)) || [], works: groups[1].get(String(row.id)) || [],
        composers: groups[2].get(String(row.id)) || [], prices: groups[3].get(String(row.id)) || [],
        sourceUrls: [...(sourceUrlsByPrimary.get(row.id) || [])].sort(),
      })),
      pagination: { page: input.all ? null : input.page, page_size: input.all ? null : input.pageSize, total, total_pages: input.all ? null : Math.ceil(total / input.pageSize), all: input.all },
      generated_at: new Date().toISOString(),
    }
  }, { isolationLevel: 'repeatable read', readOnly: true })
}
