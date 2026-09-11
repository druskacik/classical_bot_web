import test from 'node:test'
import assert from 'node:assert/strict'
import { createDataCache, isDataCacheEnabled } from '../layers/concerts/server/utils/data-cache.js'
import { concertFilterCacheInput, siteDataCacheKey } from '../layers/concerts/server/utils/data-cache-keys.js'
import { parseConcertFilters } from '../layers/concerts/server/utils/concert-filters.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const cache = options => createDataCache({ enabled: () => true, ...options })

test('cache defaults follow runtime mode and explicit overrides', () => {
  assert.equal(isDataCacheEnabled({ NODE_ENV: 'production' }), true)
  assert.equal(isDataCacheEnabled({ NODE_ENV: 'development' }), false)
  assert.equal(isDataCacheEnabled({}), false)
  assert.equal(isDataCacheEnabled({ NODE_ENV: 'production', SERVER_DATA_CACHE_ENABLED: 'false' }), false)
  assert.equal(isDataCacheEnabled({ NODE_ENV: 'development', SERVER_DATA_CACHE_ENABLED: 'true' }), true)
})

test('concurrent misses share one load; TTL starts at completion and hits do not extend it', async () => {
  let time = 0, calls = 0
  const store = cache({ now: () => time })
  const gate = deferred()
  const loader = () => { calls++; return gate.promise }
  const first = store.get('concerts', 'a', 120, loader)
  const second = store.get('concerts', 'a', 120, loader)
  await Promise.resolve()
  assert.equal(calls, 1)
  time = 100
  gate.resolve({ items: [{ date: new Date('2026-09-11'), title: 'Original' }] })
  const [a, b] = await Promise.all([first, second])
  a.items[0].title = 'Changed'
  assert.equal(b.items[0].title, 'Original')
  time = 219
  const hit = await store.get('concerts', 'a', 120, loader)
  assert.equal(hit.items[0].title, 'Original')
  assert.ok(hit.items[0].date instanceof Date)
  assert.equal(calls, 1)
  time = 220
  await store.get('concerts', 'a', 120, loader)
  assert.equal(calls, 2)
  assert.deepEqual(store.snapshot().concerts, {
    hits: 1, misses: 2, shared: 1, loadFailures: 0, evictions: 0, bypasses: 0,
    retainedEntries: 1, retainedBytes: store.snapshot().concerts.retainedBytes,
  })
})

test('failed refresh is shared, never serves stale data, and allows retry; empty results cache', async () => {
  let time = 0, calls = 0
  const store = cache({ now: () => time })
  await store.get('a', 'key', 10, () => ['old'])
  time = 10
  const gate = deferred()
  const load = () => { calls++; return gate.promise }
  const results = Promise.allSettled([store.get('a', 'key', 10, load), store.get('a', 'key', 10, load)])
  gate.reject(new Error('unavailable'))
  assert.ok((await results).every(result => result.status === 'rejected' && result.reason.message === 'unavailable'))
  assert.equal(calls, 1)
  assert.equal(store.snapshot().a.retainedEntries, 0)
  assert.equal(store.snapshot().a.loadFailures, 1)
  assert.deepEqual(await store.get('a', 'key', 10, () => []), [])
  assert.deepEqual(await store.get('a', 'key', 10, () => { throw Error('must not run') }), [])
})

test('entry eviction is LRU and shared across namespaces; expired entries are pruned', async () => {
  let time = 0
  const store = cache({ maxEntries: 2, now: () => time })
  const put = (namespace, key) => store.get(namespace, key, 10, () => key)
  await put('a', 'one')
  await put('b', 'two')
  await put('a', 'one')
  await put('a', 'three')
  assert.equal(store.snapshot().b.evictions, 1)
  assert.equal(store.snapshot().b.retainedEntries, 0)
  time = 10
  assert.equal(store.snapshot().a.retainedEntries, 0)
  assert.equal(store.snapshot().a.retainedBytes, 0)
})

test('byte budget includes UTF-8 keys and values; oversized results and keys bypass retention', async () => {
  const key = 'ž'
  const value = 'é'
  const size = Buffer.byteLength(JSON.stringify(['a', key])) + Buffer.byteLength(JSON.stringify(value))
  const store = cache({ maxBytes: size, maxEntryBytes: size })
  await store.get('a', key, 100, () => value)
  assert.equal(store.snapshot().a.retainedBytes, size)
  await store.get('a', 'x', 100, () => value)
  assert.equal(store.snapshot().a.evictions, 1)
  let calls = 0
  for (let i = 0; i < 2; i++) await store.get('a', 'big', 100, () => { calls++; return 'x'.repeat(size) })
  assert.equal(calls, 2)
  await store.get('a', 'k'.repeat(size), 100, () => value)
  assert.equal(store.snapshot().a.bypasses, 3)
})

test('pending limit bypasses new keys but still shares an existing key', async () => {
  const store = cache({ maxPending: 1 })
  const gate = deferred()
  const first = store.get('a', 'one', 100, () => gate.promise)
  const shared = store.get('a', 'one', 100, () => { throw Error('duplicate') })
  let calls = 0
  const overflow = () => { calls++; return [] }
  await store.get('a', 'two', 100, overflow)
  await store.get('a', 'two', 100, overflow)
  assert.equal(calls, 2)
  gate.resolve([])
  await Promise.all([first, shared])
  await store.get('a', 'two', 100, overflow)
  await store.get('a', 'two', 100, overflow)
  assert.equal(calls, 3)
  assert.equal(store.snapshot().a.bypasses, 2)
})

test('disabled mode bypasses storage and sharing, including existing cached results', async () => {
  let enabled = true, calls = 0
  const store = cache({ enabled: () => enabled })
  const load = () => ++calls
  await store.get('a', 'key', 100, load)
  enabled = false
  assert.deepEqual(await Promise.all([store.get('a', 'key', 100, load), store.get('a', 'key', 100, load)]), [2, 3])
  assert.equal(store.snapshot().a.bypasses, 2)
})

test('metrics reset counters without losing retained gauges or late failures', async () => {
  const store = cache()
  await store.get('a', 'key', 1000, () => [])
  const gate = deferred()
  const result = store.get('a', 'pending', 1000, () => gate.promise)
  const rejected = assert.rejects(result, /late/)
  assert.equal(store.snapshot({ reset: true }).a.misses, 2)
  gate.reject(new Error('late'))
  await rejected
  assert.equal(store.snapshot().a.misses, 0)
  assert.equal(store.snapshot().a.loadFailures, 1)
  assert.equal(store.snapshot().a.retainedEntries, 1)
})

test('validated cache keys normalize set filters, preserve other inputs, and isolate sites', () => {
  const site = { country: null, locale: 'en-GB', cityRoutes: 'global' }
  const input = { country: 'cz', composers: 'Mozart,Bach,Mozart', works: '2,1,01', utm_source: 'tracking' }
  const filters = parseConcertFilters(input)
  const key = (query, page = 1, currentSite = site) => siteDataCacheKey(currentSite, { filters: concertFilterCacheInput(parseConcertFilters(query)), page })
  const original = structuredClone(filters)
  concertFilterCacheInput(filters)
  assert.deepEqual(filters, original)
  assert.equal(key(input), key({ country: 'CZ', composers: 'Bach,Mozart', works: '1,2' }))
  for (const change of [{ country: 'SK' }, { city: '123' }, { dateFrom: '2026-09-12' }, { dateTo: '2026-09-13' }, { composers: 'Bach' }, { works: '3' }]) {
    assert.notEqual(key(input), key({ ...input, ...change }))
  }
  assert.notEqual(key(input), key(input, 2))
  for (const change of [{ country: 'SK' }, { locale: 'sk-SK' }, { cityRoutes: 'local' }]) {
    assert.notEqual(key(input), key(input, 1, { ...site, ...change }))
  }
  const facet = { type: 'city', filters: concertFilterCacheInput(filters), search: 'pra', selected: ['Prague,CZ', 'Brno,CZ'] }
  for (const change of [{ type: 'work' }, { search: 'brn' }, { selected: [...facet.selected].reverse() }]) {
    assert.notEqual(siteDataCacheKey(site, facet), siteDataCacheKey(site, { ...facet, ...change }))
  }
})
