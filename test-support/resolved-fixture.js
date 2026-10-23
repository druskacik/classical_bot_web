import { readFile } from 'node:fs/promises'

// Isolated fixtures only. Frozen backend policy SQL is copied verbatim, not a
// second application aggregation implementation. Never use an application DSN.
export const publicationOrder = ['resolved_concert_member', 'resolved_concert_source_url', 'resolved_concert', 'resolved_concert_performer', 'resolved_concert_work', 'resolved_concert_composer', 'resolved_concert_ticket_price']
export async function installResolvedFixture(db, { populate = true } = {}) {
  const definitions = {
    classical_concert: { id: 'integer', date: 'date', title: 'text', description: 'text', type: 'text', url: 'text', source: 'text', source_url: 'text', time_from: 'time', time_to: 'time', venue: 'text', venue_id: 'bigint', city_id: 'bigint', city_raw: 'text', country_code_resolved: 'text', country_code_raw: 'text', inclusion_status: "text DEFAULT 'included'", duplicate_of_id: 'integer', buy_url: 'text', event_status: 'text', event_status_updated_at: 'timestamptz', last_verified_at: 'timestamptz', admission_type: 'text', booking_kind: 'text', booking_status: 'text', on_sale_at: 'timestamptz' },
    venue: { id: 'bigint PRIMARY KEY', name: 'text', city_id: 'bigint', country_code: 'text', address: 'text', identity_url: 'text', parent_venue_id: 'bigint', latitude: 'float8', longitude: 'float8' },
    performer: { id: 'bigint PRIMARY KEY', name: 'text', kind: 'text', identity_url: 'text' },
    composer: { id: 'integer PRIMARY KEY', name: 'text', normalized_name: 'text' },
    work: { id: 'integer PRIMARY KEY', title: 'text', composer_id: 'integer', catalogue_number: 'text' },
    classical_concert_performer: { classical_concert_id: 'integer', performer_id: 'bigint', roles: 'text[]', instruments: 'text[]', voice_type: 'text', character_name: 'text', ensemble_id: 'bigint', qualifier: 'text', display_order: 'integer', source_url: 'text', evidence: 'text', checked_at: 'timestamptz' },
    classical_concert_work: { classical_concert_id: 'integer', work_id: 'integer', programme_label: 'text', source_url: 'text', evidence: 'text' },
    classical_concert_composer: { classical_concert_id: 'integer', composer_id: 'integer' },
    classical_concert_ticket_price: { id: 'integer', classical_concert_id: 'integer', kind: 'text', price_type: 'text', amount: 'numeric(14,4)', amount_max: 'numeric(14,4)', currency: 'text', category: 'text', audience: 'text', conditions: 'text', basis: 'text', offer_key: 'text', source_url: 'text', evidence: 'text', checked_at: 'timestamptz' },
    concert_extraction_state: { classical_concert_id: 'integer', field_group: 'text', status: 'text', requires_revalidation: 'boolean DEFAULT false', accepted_result: 'jsonb', accepted_at: 'timestamptz', accepted_model: 'text', inherited_from_concert_id: 'integer' },
  }
  for (const [table, columns] of Object.entries(definitions)) {
    await db.raw('CREATE TABLE IF NOT EXISTS ?? ()', [table])
    for (const [column, type] of Object.entries(columns)) {
      await db.raw(`ALTER TABLE ?? ADD COLUMN IF NOT EXISTS ?? ${type}`, [table, column])
    }
  }
  await db.raw(await readFile(new URL('./resolved-policy-v1.sql', import.meta.url), 'utf8'))
  await db.raw(await readFile(new URL('./resolved-source-directory.sql', import.meta.url), 'utf8'))
  await db.raw("CREATE INDEX resolved_member_eligible_source_url ON resolved_concert_member ((data->>'source_url')) INCLUDE (concert_id, member_id) WHERE eligible")
  if (populate) await publishResolvedFixture(db)
}
export async function publishResolvedFixture(db, { concurrent = false } = {}) {
  await db.transaction(async trx => {
    for (const view of publicationOrder) await trx.raw(`REFRESH MATERIALIZED VIEW ${concurrent ? 'CONCURRENTLY' : ''} ??`, [view])
    await trx('resolved_concert_refresh_state').update({ published_at: trx.fn.now(), last_failure_at: null, last_error: null })
  })
}
