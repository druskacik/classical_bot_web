import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestDatabase } from '../test-support/postgres.js'
import { seedComposers } from '../test-support/composer-fixture.js'
import { publishResolvedFixture } from '../test-support/resolved-fixture.js'
import { queryComposerRecommendations } from '../server/utils/composer-recommendation-query.js'

test('source recommendations with isolated PostgreSQL', async t => {
  const { db } = await createTestDatabase(t)
  await seedComposers(db)
  const before = await db.raw('SHOW jit')
  const rankings = await queryComposerRecommendations(db)
  assert.deepEqual(rankings[1], [
    { id: 6, sharedSources: 2, totalSources: 2, score: 1 },
    { id: 3, sharedSources: 2, totalSources: 2, score: 1 },
    { id: 4, sharedSources: 2, totalSources: 2, score: 1 },
    { id: 2, sharedSources: 2, totalSources: 3, score: 2/3 },
  ])
  assert.ok(rankings[4].some(row => row.id === 1), 'donor composers and sources contribute to the group')
  assert.equal(rankings[5], undefined, 'unpublished composers are ineligible')
  assert.deepEqual((await db.raw('SHOW jit')).rows, before.rows, 'JIT setting does not escape the transaction')
  const tie = await db.transaction()
  try {
    await tie('composer').insert({ id: 7, name: 'Alpha' })
    await tie('composer_spotify_playlist').insert({ id: 7, composer_id: 7, status: 'published', is_public: true, spotify_playlist_id: '1234567890123456789012' })
    await tie('classical_concert_composer').insert({ classical_concert_id: 1, composer_id: 7 })
    await publishResolvedFixture(tie)
    assert.deepEqual((await queryComposerRecommendations(tie))[1].map(c => c.id), [6, 7, 3, 4, 2])
  } finally {
    await tie.rollback()
  }

})
