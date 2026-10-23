import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecommendationCache, recommendationCacheOptions, selectRelatedComposers } from '../server/utils/composer-recommendation-cache.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const silent = { info() {}, error() {} }
const first = '2026-10-22T12:00:00.000Z'
const next = '2026-10-22T13:00:00.000Z'
const rankings = { 1: [{ id: 2, score: 0.5 }] }
const updated = { 1: [{ id: 3, score: 0.75 }] }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('cold reads return fallback immediately and share the startup/background load', async () => {
  const load = deferred()
  let calls = 0
  const cache = createRecommendationCache(() => { calls++; return load.promise }, { logger: silent })
  const warm = cache.warm()
  for (let i = 0; i < 50; i++) assert.deepEqual(cache.get(first), {})
  assert.equal(cache.warm(), warm, 'startup and requests share one in-flight operation')
  await tick()
  assert.equal(calls, 1)
  load.resolve({ publishedAt: first, rankings })
  await warm
  assert.equal(cache.get(first), rankings)
  assert.equal(calls, 1)
  assert.equal(recommendationCacheOptions.maxAgeMs, 86400_000)
  assert.equal(recommendationCacheOptions.retryDelayMs, 60_000)
})

test('failed background loads are caught, sanitized and retried only after backoff', async () => {
  let now = 0, calls = 0
  const errors = []
  const cache = createRecommendationCache(() => {
    if (++calls === 1) throw new Error('private connection details and SQL')
    return { publishedAt: first, rankings }
  }, { now: () => now, logger: { info() {}, error(message) { errors.push(message) } } })
  assert.deepEqual(cache.get(first), {})
  await cache.warm() // The failure must not reject or become an unhandled promise.
  assert.equal(calls, 1)
  assert.equal(errors.length, 1)
  assert.doesNotMatch(errors[0], /private connection|SQL/)
  for (let i = 0; i < 50; i++) assert.deepEqual(cache.get(first), {})
  await cache.warm()
  assert.equal(calls, 1, 'failed attempts are not repeated for each visitor')
  now = 59_999
  assert.deepEqual(cache.get(next), {})
  await tick()
  assert.equal(calls, 1, 'publication changes do not bypass failure backoff')
  now = 60_000
  assert.deepEqual(cache.get(first), {})
  await cache.warm()
  assert.equal(calls, 2)
  assert.equal(cache.get(first), rankings)
})

test('expired same-publication rankings remain usable while refresh fails or succeeds', async () => {
  let now = 0, calls = 0
  const refresh = deferred()
  const cache = createRecommendationCache(() => {
    calls++
    if (calls === 1) return { publishedAt: first, rankings }
    if (calls === 2) throw new Error('database unavailable')
    return refresh.promise
  }, { now: () => now, maxAgeMs: 1000, retryDelayMs: 500, logger: silent })
  await cache.warm()
  now = 1000
  assert.equal(cache.get(first), rankings)
  await cache.warm()
  assert.equal(cache.get(first), rankings, 'failure must not replace a successful snapshot with emptiness')
  assert.equal(calls, 2)
  now = 1500
  assert.equal(cache.get(first), rankings)
  await tick()
  assert.equal(calls, 3)
  const pending = cache.warm()
  refresh.resolve({ publishedAt: first, rankings: updated })
  await pending
  assert.equal(cache.get(first), updated)
})

test('new publications use fallback until ready and never expose another generation', async () => {
  let calls = 0
  const load = deferred()
  const cache = createRecommendationCache(() => ++calls === 1
    ? { publishedAt: first, rankings } : load.promise, { logger: silent })
  await cache.warm()
  assert.deepEqual(cache.get(next), {})
  assert.equal(cache.get(first), rankings)
  const pending = cache.warm()
  await tick()
  assert.equal(calls, 2)
  load.resolve({ publishedAt: next, rankings: updated })
  await pending
  assert.equal(cache.get(next), updated)
  assert.deepEqual(cache.get(first), {}, 'an older request uses directory fallback, not newer rankings')
  await tick()
  assert.equal(calls, 2, 'older requests do not cause backwards refreshes')
})

test('failed new-publication loads preserve the previous successful snapshot', async () => {
  let calls = 0
  const cache = createRecommendationCache(() => {
    if (++calls === 1) return { publishedAt: first, rankings }
    throw new Error('failed refresh')
  }, { logger: silent })
  await cache.warm()
  assert.deepEqual(cache.get(next), {})
  await cache.warm()
  assert.equal(cache.get(first), rankings)
  assert.deepEqual(cache.get(next), {})
  assert.equal(calls, 2)
})

test('the background snapshot supplies the actual publication key, not the triggering request', async () => {
  const cache = createRecommendationCache(() => ({ publishedAt: next, rankings: updated }), { logger: silent })
  assert.deepEqual(cache.get(first), {})
  await cache.warm()
  assert.deepEqual(cache.get(first), {})
  assert.equal(cache.get(next), updated)
  assert.deepEqual(cache.get(undefined), {})
})

test('recommendations use current directory objects and fill only missing slots', () => {
  const directory = [1, 2, 3, 4, 5].map(id => ({ id, name: `Current ${id}`, concertCount: id }))
  const ranks = { 1: [{ id: 1 }, { id: 99 }, { id: 4 }, { id: 4 }, { id: 3 }] }
  const related = selectRelatedComposers(1, directory, ranks)
  assert.deepEqual(related.map(c => c.id), [4, 3, 2])
  assert.equal(related[0], directory[3])
  assert.deepEqual(selectRelatedComposers(1, directory, {}).map(c => c.id), [2, 3, 4])
  assert.deepEqual(selectRelatedComposers(1, directory.slice(0, 1), {}), [])
})
