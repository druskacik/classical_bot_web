import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { createStorage } from 'unstorage'
import { createRecommendationCache, recommendationCacheOptions, selectRelatedComposers } from '../server/utils/composer-recommendation-cache.js'

// Exercise the installed Nitro cache implementation, substituting only its
// application/storage boundaries (which normally come from the Nitro bundle).
const storage = createStorage()
globalThis.__recommendationTestStorage = storage
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/runtime/internal/cache.mjs')) {
      const code = specifier === './storage.mjs'
        ? 'export const useStorage = () => globalThis.__recommendationTestStorage'
        : specifier === './app.mjs' ? 'export const useNitroApp = () => ({ captureError() {} })' : null
      if (code) return { url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { defineCachedFunction } = await import('nitropack/runtime/internal/cache')
hooks.deregister()

const tick = () => new Promise(resolve => setImmediate(resolve))
const silent = { info() {}, error() {} }

test('publication-keyed Nitro cache shares loads and never mixes generations', async t => {
  await storage.clear()
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  t.mock.method(console, 'error', () => {})
  let loads = 0, finish, fail
  const get = createRecommendationCache(defineCachedFunction, () => {
    loads++
    return new Promise((resolve, reject) => { finish = resolve; fail = reject })
  }, silent)
  const first = get('publication-1'), concurrent = get('publication-1')
  await tick()
  assert.equal(loads, 1)
  const original = { 1: [{ id: 2, score: 0.5 }] }
  finish(original)
  assert.deepEqual(await first, original)
  assert.deepEqual(await concurrent, original)
  await tick()
  now += 3600 * 1000
  assert.deepEqual(await get('publication-1'), original, 'failed publisher retains the same cache key')
  assert.equal(loads, 1)
  const next = get('publication-2')
  const rejected = assert.rejects(next, /Composer recommendations unavailable/)
  await tick()
  assert.equal(loads, 2)
  fail(new Error('private database details'))
  await rejected
  assert.deepEqual(await get('publication-1'), original)
  const retry = get('publication-2')
  await tick()
  const updated = { 1: [{ id: 3, score: 0.75 }] }
  finish(updated)
  assert.deepEqual(await retry, updated)
  assert.deepEqual(await get('publication-2'), updated)
  assert.equal(loads, 3)
})

test('a failed cold load rejects safely and can be retried', async () => {
  await storage.clear()
  let attempts = 0
  const get = createRecommendationCache(defineCachedFunction, async () => {
    if (++attempts === 1) throw new Error('private connection details')
    return {}
  }, silent)
  await assert.rejects(get(), { message: 'Composer recommendations unavailable' })
  assert.deepEqual(await get(), {})
  assert.equal(attempts, 2)
  assert.equal(recommendationCacheOptions.maxAge, 86400)
})

test('recommendations use current directory objects and fill only missing slots', () => {
  const directory = [1, 2, 3, 4, 5].map(id => ({ id, name: `Current ${id}`, concertCount: id }))
  const rankings = { 1: [{ id: 1 }, { id: 99 }, { id: 4 }, { id: 4 }, { id: 3 }] }
  const related = selectRelatedComposers(1, directory, rankings)
  assert.deepEqual(related.map(c => c.id), [4, 3, 2])
  assert.equal(related[0], directory[3])
  assert.deepEqual(selectRelatedComposers(1, directory, {}).map(c => c.id), [2, 3, 4])
  assert.deepEqual(selectRelatedComposers(1, directory.slice(0, 1), {}), [])
})
