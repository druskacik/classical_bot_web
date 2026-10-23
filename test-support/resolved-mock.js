import assert from 'node:assert/strict'

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
    if (sql.includes('to_regclass')) return { run: async () => ({ rows: [{installed:true}] }) }
    if (sql.includes('"serving"."state"')) return { run: async () => ({ id:'1',schema_version:1,published_at:'2026-10-23T00:00:00Z',input_published_at:'2026-10-23T00:00:00Z',current_date:'2026-10-23' }) }
    if (sql.includes('set_config') || sql.includes('SET LOCAL')) return {run:async()=>({rows:[]})}
    return runner(builder)
  }
}
