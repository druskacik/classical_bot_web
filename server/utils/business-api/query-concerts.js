import { fail, MAX_EXPORT_ROWS } from './contract.js'
import { resolveSource, normalizedSourceUrl } from './resolve-source.js'
import { serializeConcert } from './serialize-concert.js'
import { applyPublicConcertScope } from '../../../layers/concerts/server/utils/public-concerts.js'
import { withResolvedSnapshot, concertComposers, concertWorks, concertPerformers, concertPrices } from '../../../layers/concerts/server/utils/resolved-concerts.js'

export async function queryConcerts(db, input) {
  return withResolvedSnapshot(db, trx => queryConcertSnapshot(trx, input))
}

export async function queryConcertSnapshot(trx, input) {
    await trx.raw("SET LOCAL statement_timeout = '15s'")
    await trx.raw("SET LOCAL TIME ZONE 'UTC'")
    const sources = await trx('crawler_source').select('id', 'canonical_url', 'duplicate_of_id')
    const aliases = await trx('crawler_source_url').select('crawler_source_id', 'url')
    const resolved = resolveSource(input.url, sources, aliases)
    // Preserve legacy URL spelling normalization separately from concert grouping.
    const storedUrls = await trx('resolved_concert_member').where('eligible', true)
      .distinct(trx.raw("data->>'source_url' as source_url")).whereRaw("data->>'source_url' IS NOT NULL")
    const accepted = new Set(resolved.aliases)
    const urls = storedUrls.filter(row => accepted.has(normalizedSourceUrl(row.source_url))).map(row => row.source_url)
    const members = () => trx('resolved_concert_member').where('eligible', true)
      .whereIn(trx.raw("data->>'source_url'"), urls)
    // Scan eligible JSON matching once, not separately for count, page, name and
    // provenance. Only narrow public source fields leave the member relation.
    const origins = urls.length ? await members().select('concert_id',
      trx.raw("data->>'url' as url"), trx.raw("data->>'source' as source"))
      .orderByRaw("(data->>'date')::date DESC").orderBy('member_id', 'desc') : []
    const nameRow = origins.find(row => row.source?.trim())
    const source = { id: resolved.id, name: nameRow?.source?.trim() || new URL(resolved.url).hostname, url: resolved.url }
    const sourceUrlsByPrimary = new Map()
    for (const member of origins) {
      const key = String(member.concert_id)
      if (!sourceUrlsByPrimary.has(key)) sourceUrlsByPrimary.set(key, new Set())
      if (member.url) sourceUrlsByPrimary.get(key).add(member.url)
    }
    const primaryIds = [...sourceUrlsByPrimary.keys()]
    // Distinct materialized mappings constrain count/page before loading details.
    const scoped = () => trx('resolved_concert as cc').modify(applyPublicConcertScope)
      .whereRaw('cc.id = ANY(?::int[])', [primaryIds])
    const count = await scoped().count('* as total').first()
    const total = Number(count.total)
    if (input.all && total > MAX_EXPORT_ROWS) throw fail(422, 'export_too_large', 'Export exceeds 10000 concerts; use pagination.')
    const rows = await scoped()
      .leftJoin('resolved_concert_member as representative', 'representative.member_id', 'cc.id')
      // Parent name is live registry enrichment; selected venue/geography are snapshots.
      .leftJoin('venue as parent', 'parent.id', trx.raw("(cc.venue_details->>'parent_venue_id')::bigint"))
      .leftJoin('city as city', 'city.id', 'cc.city_id')
      .select('cc.id', 'cc.title', 'cc.url', 'cc.time_from', 'cc.time_to', 'cc.venue', 'cc.venue_id',
        'cc.buy_url', 'cc.event_status', trx.raw("(representative.data->>'last_verified_at')::timestamptz as last_verified_at"),
        'cc.admission_type', 'cc.booking_kind', 'cc.booking_status', 'cc.on_sale_at',
        trx.raw("to_char(cc.date, 'YYYY-MM-DD') as date"),
        trx.raw('COALESCE(city.english_name, city.local_name, cc.city_raw) as city'),
        trx.raw('COALESCE(cc.country_code_resolved, cc.country_code_raw) as country_code'),
        trx.raw("cc.venue_details->>'name' as venue_name"), trx.raw("cc.venue_details->>'address' as venue_address"),
        trx.raw("cc.venue_details->>'identity_url' as venue_url"),
        trx.raw("(cc.venue_details->>'latitude')::float8 as latitude"), trx.raw("(cc.venue_details->>'longitude')::float8 as longitude"),
        'parent.name as parent_venue_name')
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
    const groups = (ids.length ? await Promise.all([
      concertPerformers(trx, ids), concertWorks(trx, ids), concertComposers(trx, ids), concertPrices(trx, ids),
    ]) : [[], [], [], []]).map(byConcert)
    return {
      source,
      concerts: rows.map(row => serializeConcert(row, source, {
        performers: groups[0].get(String(row.id)) || [], works: groups[1].get(String(row.id)) || [],
        composers: groups[2].get(String(row.id)) || [], prices: groups[3].get(String(row.id)) || [],
        sourceUrls: [...(sourceUrlsByPrimary.get(String(row.id)) || [])].sort(),
      })),
      pagination: { page: input.all ? null : input.page, page_size: input.all ? null : input.pageSize, total, total_pages: input.all ? null : Math.ceil(total / input.pageSize), all: input.all },
      generated_at: new Date().toISOString(),
    }
}
