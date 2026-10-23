import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { resolvedViews, resolvedPublication, withResolvedSnapshot, displaySource, concertPrices } from '../layers/concerts/server/utils/resolved-concerts.js'

function fixture() {
  const db = knex({ client: 'pg' })
  const state = { relations: [...resolvedViews, 'resolved_concert_refresh_state'].map(name => ({ name, populated: true, readable: true })), published: new Date(), reads: 0 }
  db.client.runner = builder => ({ run: async () => {
    if (builder.toSQL().sql.includes('FROM unnest(')) return { rows: state.relations }
    state.reads++
    return { published_at: state.published }
  } })
  return { db, state }
}

test('initial absence, unpopulated views, missing publication and missing SELECT fail closed', async () => {
  for (const name of [...resolvedViews, 'resolved_concert_refresh_state']) {
    for (const key of ['readable', ...(resolvedViews.includes(name) ? ['populated'] : [])]) {
      const { db, state } = fixture()
      state.relations.find(row => row.name === name)[key] = false
      await assert.rejects(resolvedPublication(db), { statusCode: 503, statusMessage: 'Concert catalogue temporarily unavailable' })
      assert.equal(state.reads, 0, 'never query unready relations')
    }
  }
  const { db, state } = fixture()
  state.published = null
  await assert.rejects(resolvedPublication(db), { statusCode: 503 })
  state.relations = []
  await assert.rejects(resolvedPublication(db), { statusCode: 503 })
})

test('staleness follows successful publication and does not make a published dataset unavailable', async () => {
  const { db, state } = fixture()
  assert.equal((await resolvedPublication(db)).stale, false)
  state.published = new Date(Date.now() - 46 * 60_000)
  assert.deepEqual(await resolvedPublication(db), { publishedAt: state.published.toISOString(), stale: true })
  db.context.transaction = async (load, options) => {
    assert.deepEqual(options, { isolationLevel: 'repeatable read', readOnly: true })
    return load(db)
  }
  assert.equal(await withResolvedSnapshot(db, (trx, publication) => {
    assert.equal(trx, db)
    return publication.stale
  }), true)
})

test('adapters extract public snapshot fields without evidence or offer deduplication', () => {
  const db = knex({ client: 'pg' })
  const price = concertPrices(db, [1]).toSQL()
  assert.match(price.sql, /"rp"\."offer_id" as "id"/)
  assert.doesNotMatch(price.sql, /distinct|group by|provenance|conflicts|states/)
  const source = displaySource(db, 'source').toSQL()
  assert.match(source.sql, /ORDER BY .*concert_id.* = "cc".id DESC/s)
  assert.throws(() => displaySource(db, 'conflicts'))
})
