import { mockResolvedSnapshot } from '../test-support/resolved-mock.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import knex from 'knex'
import { concertDetails } from '../server/utils/alerts/criteria.js'
import { parseConcertFilters } from '../layers/concerts/server/utils/concert-filters.js'

// Run the real handlers and query builders, replacing only database I/O and the
// separately cached city catalogue. No production connection or dotenv import.
const site = { country: null, locale: 'en-GB', cityRoutes: 'global' }
const city = { id: '1', name: 'Bratislava', countryCode: 'SK', path: '/slovakia/bratislava' }
const catalogue = { byId: new Map([['1', city]]), byPath: new Map() }
const db = knex({ client: 'pg' })
let queries = 0, documentQueries = 0, fail = false
let pageItems = [{ id: 7, title: ' Mozart   concert ', date: '2026-12-01', city_id: 1, city: 'Bratislava', country_code: 'SK' }]
let documents = [{ concert_id: 7, composers: [{ classical_concert_id: 7, id: 3, name: 'Mozart' }], works: [] }]
db.client.runner = builder => ({
  run: async () => {
    queries++
    if (fail) throw new Error('Database unavailable')
    const { sql } = builder.toSQL()
    if (sql.includes('as "total"')) return { total: String(pageItems.length) }
    if (sql.includes('"cc"."source"') && sql.includes('"cc"."title"')) {
      assert.ok(sql.includes("to_char(cc.date, 'YYYY-MM-DD') || 'T00:00:00.000Z' as date"), 'calendar dates must reach JSON as text, bypassing pg server-local Date conversion')
    }
    if (sql.includes('"serving"."current_document"')) {
      documentQueries++
      return documents
    }
    if (sql.includes('as registry_id')) {
      return [{ registry_id: 1, registry_url: 'https://example.com', country_code: 'SK', geographic_scope: 'country', source: ' Orchestra ', source_url: 'https://example.com', concert_count: '1' }]
    }
    if (sql.includes("composer.name")) return [{ name: 'Mozart', count: '1' }]
    if (sql.includes('count(distinct')) return [{ value: 'SK', count: '1' }]
    if (sql.includes('group by "cc"."city_id"')) return [{ city_id: 1, city_raw: 'Bratislava', count: '1' }]
    if (sql.includes('group by "country_code_resolved"')) return [{ country_code_resolved: 'SK', count: '1' }]
    return sql.includes('where 1 = ?') ? [] : pageItems
  },
})
mockResolvedSnapshot(db)
globalThis.cacheEndpointFixtures = { site, db, catalogue }
globalThis.defineEventHandler = handler => handler
globalThis.getQuery = event => event.query || {}
globalThis.createError = details => Object.assign(new Error(details.statusMessage), details)
const sourceModule = source => `data:text/javascript,${encodeURIComponent(source)}`
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#concert-site') return { shortCircuit: true, url: sourceModule('export const concertSite = globalThis.cacheEndpointFixtures.site') }
    if (specifier.endsWith('/connection.js')) return { shortCircuit: true, url: sourceModule('export default globalThis.cacheEndpointFixtures.db') }
    if (specifier.endsWith('/utils/city-catalogue.js')) return { shortCircuit: true, url: sourceModule('export const getCityCatalogue = async () => globalThis.cacheEndpointFixtures.catalogue') }
    if (specifier.startsWith('#layers/concerts/')) return nextResolve(new URL(`../layers/concerts/${specifier.slice('#layers/concerts/'.length)}`, import.meta.url).href, context)
    return nextResolve(specifier, context)
  },
})
const endpoint = async file => (await import(new URL(`../${file}`, import.meta.url))).default
const concerts = await endpoint('layers/concerts/server/api/get-concerts.js')
const facets = await endpoint('layers/concerts/server/api/get-concert-filter-options.js')
const countries = await endpoint('layers/concerts/server/api/get-countries.js')
const sources = await endpoint('layers/concerts/server/api/get-sources.js')
const composers = await endpoint('layers/concerts/server/api/get-composers.js')
const cities = await endpoint('apps/classical-sk/server/api/get-cities.js')
hooks.deregister()

test('real endpoints preserve output, skip catalogue queries on hits, and isolate both sites', async t => {
  const original = process.env.SERVER_DATA_CACHE_ENABLED
  t.after(() => {
    if (original === undefined) delete process.env.SERVER_DATA_CACHE_ENABLED
    else process.env.SERVER_DATA_CACHE_ENABLED = original
  })
  for (const local of [false, true]) {
    Object.assign(site, local ? { country: 'SK', locale: 'sk-SK', cityRoutes: 'local' } : { country: null, locale: 'en-GB', cityRoutes: 'global' })
    city.path = local ? '/Bratislava' : '/slovakia/bratislava'
    const handlers = [[concerts, {}], [facets, { type: 'country' }], [facets, { type: 'country', includeUnavailable: 'true' }], [countries, {}], [sources, {}], [composers, {}]]
    if (local) handlers.push([cities, {}])
    for (const [handler, query] of handlers) {
      process.env.SERVER_DATA_CACHE_ENABLED = 'false'
      const expected = await handler({ query })
      process.env.SERVER_DATA_CACHE_ENABLED = 'true'
      const before = queries
      const beforeDocuments = documentQueries
      const first = await handler({ query })
      assert.ok(queries > before, 'A cold endpoint must execute database work')
      if (handler === concerts) assert.equal(documentQueries - beforeDocuments, 1, 'A listing batch reads music documents once')
      const after = queries
      const afterDocuments = documentQueries
      const hit = await handler({ query: { ...query, utm_source: 'ignored' } })
      assert.equal(queries, after, 'A warm endpoint must skip catalogue work (readiness is checked separately)')
      assert.equal(documentQueries, afterDocuments, 'A listing cache hit does not read music documents')
      assert.deepEqual(first, expected)
      assert.deepEqual(hit, expected)
    }
    const result = await concerts({ query: {} })
    assert.equal(result.items[0].city_path, city.path)
    assert.equal(result.items[0].title, ' Mozart concert ')
    assert.deepEqual(result.items[0].composers, [{ id: 3, name: 'Mozart' }])
    for (const query of [{ page: '0' }, { dateFrom: 'bad' }, { works: '0' }]) {
      await assert.rejects(concerts({ query }), { statusCode: 400 })
    }
  }
  for (const handler of [concerts, composers]) {
    await assert.rejects(handler({ query: { country: 'CZ' } }), { statusCode: 400 })
  }
  await assert.rejects(facets({ query: { type: 'country', country: 'CZ' } }), { statusCode: 400 })
  await assert.rejects(facets({ query: { type: 'unknown' } }), { statusCode: 400 })
  await facets({ query: { type: 'country', cityId: '1' } })
  catalogue.byId.delete('1')
  await assert.rejects(facets({ query: { type: 'country', cityId: '1' } }), { statusCode: 400 })
  catalogue.byId.set('1', city)
  await assert.rejects(concerts({ query: { city: '1', page: '2' } }), { statusCode: 404 })
  for (const query of [{ page: '2' }, { country: 'SK', page: '2' }, { city: 'Bratislava,SK', page: '2' }, { composers: 'Mozart', page: '2' }]) {
    await assert.rejects(concerts({ query }), { statusCode: 404 })
  }

  // The async cache wrapper must preserve the endpoint's public error mapping.
  fail = true
  const originalError = console.error
  console.error = () => {}
  try {
    await assert.rejects(concerts({ query: { page: '3' } }), { statusCode: 500, statusMessage: 'Failed to fetch concerts' })
  } finally {
    fail = false
    console.error = originalError
  }
  const beforeRetry = queries
  await assert.rejects(concerts({ query: { page: '3' } }), { statusCode: 404 })
  assert.ok(queries > beforeRetry, 'A failure must permit a fresh database attempt')
})

test('listing and alert batches read music once and retain per-concert ordering and fallback', async t => {
  const previous = { pageItems, documents, site: { ...site }, cache: process.env.SERVER_DATA_CACHE_ENABLED }
  t.after(() => {
    pageItems = previous.pageItems; documents = previous.documents
    Object.assign(site, previous.site)
    if (previous.cache === undefined) delete process.env.SERVER_DATA_CACHE_ENABLED
    else process.env.SERVER_DATA_CACHE_ENABLED = previous.cache
  })
  process.env.SERVER_DATA_CACHE_ENABLED = 'false'
  Object.assign(site, { country: null, locale: 'en-GB', cityRoutes: 'global' })
  pageItems = [7, 8, 9].map(id => ({ ...previous.pageItems[0], id }))
  documents = [
    { concert_id: '7', composers: [{ id: 3, name: 'Zed' }, { id: 4, name: 'Alpha' }], works: [
      { classical_concert_id: 7, id: 20, title: 'Zeta', composer_id: 3, composer_name: 'Zed' },
      { classical_concert_id: 7, id: 21, title: 'Alpha', composer_id: 4, composer_name: 'Alpha' },
      { classical_concert_id: 7, id: 20, title: 'Zeta', composer_id: 3, composer_name: 'Zed' },
    ] },
    { concert_id: 8, composers: [{ id: 5, name: 'Only composer' }], works: [] },
  ]
  let before = documentQueries
  const listing = await concerts({ query: {} })
  assert.equal(documentQueries - before, 1)
  assert.deepEqual(listing.items.map(item => item.composers), [
    [{ id: 3, name: 'Zed' }, { id: 4, name: 'Alpha' }], [{ id: 5, name: 'Only composer' }], [],
  ])
  assert.deepEqual(listing.items[0].works, [
    { id: 21, title: 'Alpha', composer: { id: 4, name: 'Alpha' } },
    { id: 20, title: 'Zeta', composer: { id: 3, name: 'Zed' } },
  ])
  assert.deepEqual(listing.items[1].works, [])
  before = documentQueries
  const details = await concertDetails(db, parseConcertFilters({}), [7, 8, 9])
  assert.equal(documentQueries - before, 1)
  assert.deepEqual(details.map(row => row.programme), ['Alpha: Alpha; Zed: Zeta; Zed: Zeta', 'Only composer', ''])
  assert.equal(documents[0].works[0].title, 'Zeta', 'Alert sorting does not mutate published arrays')

  pageItems = []
  before = documentQueries
  assert.deepEqual((await concerts({ query: {} })).items, [])
  assert.deepEqual(await concertDetails(db, parseConcertFilters({}), []), [])
  assert.equal(documentQueries, before, 'Empty listing and alert batches skip music reads')
})
