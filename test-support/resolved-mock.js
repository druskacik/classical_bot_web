import assert from 'node:assert/strict'
import { resolvedViews } from '../layers/concerts/server/utils/resolved-concerts.js'

// Keep SQL tests focused on catalogue queries, while exercising the production
// readiness code and asserting that cache loaders receive a snapshot transaction.
export function mockResolvedSnapshot(db) {
  db.context.transaction = async (load, options) => {
    assert.deepEqual(options, { isolationLevel: 'repeatable read', readOnly: true })
    return load(db)
  }
  const runner = db.client.runner
  db.client.runner = builder => {
    const { sql } = builder.toSQL()
    if (sql.includes('FROM unnest(')) return { run: async () => ({ rows: [...resolvedViews, 'resolved_concert_refresh_state'].map(name => ({ name, readable: true, populated: true })) }) }
    if (sql.includes('"resolved_concert_refresh_state"')) return { run: async () => ({ published_at: '2026-10-22T00:00:00Z' }) }
    return runner(builder)
  }
}
