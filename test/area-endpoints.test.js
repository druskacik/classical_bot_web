import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import knex from 'knex'
const site = { country: null, locale: 'en-GB', cityRoutes: 'global' }
const locations = [
  { id: '2', english_name: 'Bratislava', local_name: 'Bratislava', country_code: 'SK', latitude: 48.14816, longitude: 17.10674 },
  { id: '25', english_name: 'Vienna', local_name: 'Wien', country_code: 'AT', latitude: 48.20849, longitude: 16.37208 },
  { id: '1', english_name: 'Prague', local_name: 'Praha', country_code: 'CZ', latitude: 50.08804, longitude: 14.42076 },
  { id: '999', english_name: 'No concerts here', local_name: 'No concerts here', country_code: 'SK', latitude: 49, longitude: 19 },
]
const statements = []
const db = knex({ client: 'pg' })
db.client.runner = builder => ({ run: async () => {
  const query = builder.toSQL()
  statements.push(query)
  if (query.sql.includes('from "city"')) return locations
  if (query.sql.includes('group by "cc"."city_id"')) return [{ city_id: '2', count: '4' }, { city_id: null, count: '2' }]
  if (query.sql.includes('as "total"')) return { total: '1' }
  if (query.sql.includes('"cc"."title"')) return [{ id: 5, city_id: '2', city: 'Bratislava', country_code: 'SK', title: 'Concert', date: '2026-12-01' }]
  return []
} })
globalThis.areaFixtures = { db, site }
globalThis.defineEventHandler = fn => fn
globalThis.createError = fields => Object.assign(new Error(fields.statusMessage), fields)
globalThis.getQuery = event => event.query
const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '#concert-site') return { shortCircuit: true, url: moduleUrl('export const concertSite = globalThis.areaFixtures.site') }
  if (specifier.endsWith('/connection.js')) return { shortCircuit: true, url: moduleUrl('export default globalThis.areaFixtures.db') }
  if (specifier.endsWith('/utils/city-catalogue.js')) return { shortCircuit: true, url: moduleUrl('export const getCityCatalogue = async () => ({ byId: new Map(), byPath: new Map() })') }
  return next(specifier, context)
} })
const concerts = (await import('../layers/concerts/server/api/get-concerts.js')).default
const facets = (await import('../layers/concerts/server/api/get-concert-filter-options.js')).default
const cities = (await import('../layers/concerts/server/api/get-area-cities.js')).default
const map = (await import('../layers/concerts/server/api/get-concert-map.js')).default
hooks.deregister()

test('real area endpoints resolve coordinates, constrain all SQL, cache repeats and isolate sites', async t => {
  const previous = process.env.SERVER_DATA_CACHE_ENABLED
  process.env.SERVER_DATA_CACHE_ENABLED = 'true'
  t.after(() => { if (previous === undefined) delete process.env.SERVER_DATA_CACHE_ENABLED; else process.env.SERVER_DATA_CACHE_ENABLED = previous })
  const query = { nearCity: '2', radiusKm: '100' }
  for (const country of [null, 'SK']) {
    site.country = country
    site.locale = country ? 'sk-SK' : 'en-GB'
    site.cityRoutes = country ? 'local' : 'global'
    statements.length = 0
    const result = await concerts({ query })
    assert.equal(result.area.label, 'Bratislava')
    assert.equal(result.area.latitude, 48.14816)
    assert.equal(result.area.cityIds, undefined)
    assert.equal(result.area.unresolvedCity, undefined)
    const listing = statements.filter(statement => statement.sql.includes('from "classical_concert" as "cc"'))
    assert.equal(listing.length, 2, 'count and page queries share the area filter')
    for (const statement of listing) {
      assert.match(statement.sql, /"cc"\."city_id" in \(\?, \?\)/)
      assert.ok(statement.bindings.includes('2') && statement.bindings.includes('25'))
      assert.match(statement.sql, /or \("cc"\."city_id" is null and COALESCE\(cc.country_code_resolved, cc.country_code_raw\) = \? and LOWER\(cc.city_raw\) in/)
      assert.ok(statement.bindings.includes('bratislava'))
      assert.equal(statement.sql.includes('"cc"."country_code_resolved" = ?'), Boolean(country))
    }
    const before = statements.length
    assert.deepEqual(await concerts({ query }), result)
    assert.equal(statements.length, before, 'warm response and city catalogue avoid database reads')
    await concerts({ query: { ...query, radiusKm: '25' } })
    assert.ok(statements.length > before)
    for (const type of ['composer', 'work', 'country']) {
      statements.length = 0
      await facets({ query: { ...query, type } })
      const constrained = statements.filter(statement => statement.sql.includes('from "classical_concert" as "cc"'))
      assert.ok(constrained.length)
      for (const statement of constrained) {
        assert.match(statement.sql, /"cc"\."city_id" in/)
        assert.match(statement.sql, /LOWER\(cc.city_raw\) in/)
        assert.equal(statement.sql.includes('"cc"."country_code_resolved" = ?'), Boolean(country))
      }
    }
    const mapped = await map({ query })
    assert.equal(mapped.total, 6)
    assert.equal(mapped.mapped, 4)
    assert.equal(mapped.unmapped, 2)
    const origins = await cities({ query: { q: 'No concerts' } })
    assert.equal(origins.items[0].value, '999', 'origins do not depend on concert availability')
    const vienna = (await cities({ query: { q: 'Wien' } })).items[0]
    assert.equal(vienna.value, '25', 'local names and worldwide origins work on both sites')
    assert.equal(vienna.secondaryLabel, country ? 'Rakúsko' : 'Austria')
    assert.ok((await cities({ query: { q: 'Prague', selected: '2' } })).items.some(item => item.value === '2'))
    await assert.rejects(concerts({ query: { nearCity: '99999', radiusKm: '100' } }), { statusCode: 400 })
    await assert.rejects(facets({ query: { ...query, type: 'composer', cityId: '2' } }), { statusCode: 400 })
  }
})

test('map endpoint returns complete city totals and accounts for unmapped concerts', async () => {
  for (const country of [null, 'SK']) {
    site.country = country
    site.locale = country ? 'sk-SK' : 'en-GB'
    statements.length = 0
    const response = await map({ query: { composers: 'Mozart' } })
    assert.equal(response.mapped, 4)
    assert.equal(response.unmapped, 2)
    assert.equal(response.total, 6)
    assert.equal(response.items[0].id, '2')
    const aggregate = statements.find(statement => statement.sql.includes('group by "cc"."city_id"'))
    assert.ok(aggregate)
    assert.equal(aggregate.bindings.includes('SK'), Boolean(country))
    assert.ok(aggregate.bindings.includes('Mozart'))
    assert.doesNotMatch(aggregate.sql, /limit/)
  }
})

test('map origins use full-catalogue exact name resolution with list API semantics', async () => {
  for (const origin of ['Vienna', 'vIeNnA', 'wIeN', 'vienna,at', '25', ' Vienna ']) {
    assert.equal((await cities({ query: { origin } })).items[0].value, '25')
  }
  assert.deepEqual((await cities({ query: { origin: 'Vie' } })).items, [])
  locations.push({ ...locations[1], id: '1001', country_code: 'US' })
  try {
    assert.deepEqual((await cities({ query: { origin: 'Vienna' } })).items, [])
    assert.equal((await cities({ query: { origin: 'Vienna,AT' } })).items[0].value, '25')
  } finally { locations.pop() }
})
