import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { randomUUID } from 'node:crypto'
import knex from 'knex'

const url = process.env.CITY_DISPLAY_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname))
  assert.ok(parsed.pathname.startsWith('/test_city_display_names'))
}

test('city discovery labels and identities against disposable PostgreSQL', { skip: !url }, async t => {
  const schema = `city_display_web_${randomUUID().replaceAll('-', '')}`
  const admin = knex({ client: 'pg', connection: url })
  await admin.raw(`CREATE SCHEMA ${schema}`)
  const db = knex({ client: 'pg', connection: { connectionString: url, options: `-csearch_path=${schema}` } })
  t.after(async () => { await db.destroy(); await admin.raw(`DROP SCHEMA ${schema} CASCADE`); await admin.destroy() })
  const oldCache = process.env.SERVER_DATA_CACHE_ENABLED
  process.env.SERVER_DATA_CACHE_ENABLED = 'false'
  t.after(() => { if (oldCache === undefined) delete process.env.SERVER_DATA_CACHE_ENABLED; else process.env.SERVER_DATA_CACHE_ENABLED = oldCache })
  await db.raw(`CREATE TABLE city (id bigint PRIMARY KEY, english_name text, local_name text, display_name text, country_code text, latitude double precision, longitude double precision);
    CREATE TABLE classical_concert (id serial PRIMARY KEY, city_id bigint REFERENCES city, city_raw text, country_code_resolved text, country_code_raw text, date date DEFAULT CURRENT_DATE + 30, inclusion_status text DEFAULT 'included', duplicate_of_id integer, title text DEFAULT 'Concert', url text DEFAULT 'https://example.org', time_from time, time_to time, source text, source_url text, venue text);
    CREATE TABLE composer (id integer PRIMARY KEY, name text, normalized_name text);
    CREATE TABLE work (id integer PRIMARY KEY, composer_id integer, title text, normalized_title text);
    CREATE TABLE classical_concert_composer (classical_concert_id integer, composer_id integer);
    CREATE TABLE classical_concert_work (classical_concert_id integer, work_id integer);`)
  await db('city').insert([
    { id: 861, english_name: 'Athens', local_name: 'Athens', display_name: 'Athens (Georgia)', country_code: 'US', latitude: 33.96095, longitude: -83.37794 },
    { id: 3745, english_name: 'Athens', local_name: 'Athens', display_name: 'Athens (Ohio)', country_code: 'US', latitude: 39.32924, longitude: -82.10126 },
    { id: 3, english_name: 'Athens', local_name: 'Αθήνα', country_code: 'GR', latitude: 37.98, longitude: 23.72 },
    { id: 4, english_name: 'Vienna', local_name: 'Wien', country_code: 'AT', latitude: 48.20849, longitude: 16.37208 },
    { id: 5, english_name: 'Shared', local_name: 'Shared', country_code: 'US', latitude: 0, longitude: 0 },
    { id: 6, english_name: 'Different', local_name: 'SHARED', country_code: 'US' },
    { id: 7, english_name: 'Bratislava', local_name: 'Bratislava', country_code: 'SK', latitude: 48.14816, longitude: 17.10674 },
  ])
  await db('classical_concert').insert([
    ...Array.from({ length: 3 }, () => ({ city_id: 861, country_code_resolved: 'US' })),
    { city_id: 3745, country_code_resolved: 'US' }, { city_id: 3, country_code_resolved: 'GR' },
    { city_id: 4, country_code_resolved: 'AT' }, { city_id: 5, country_code_resolved: 'US' },
    { city_id: 7, country_code_resolved: 'SK' },
    { city_id: 861, country_code_resolved: 'US', inclusion_status: 'rejected' },
    { city_id: 861, country_code_resolved: 'US', duplicate_of_id: 1 },
  ])
  const site = { country: null, locale: 'en-GB', cityRoutes: 'global' }
  globalThis.cityDisplayFixtures = { db, site }
  globalThis.defineEventHandler = handler => handler
  globalThis.getQuery = event => event.query
  globalThis.createError = fields => Object.assign(new Error(fields.statusMessage), fields)
  const dataModule = source => `data:text/javascript,${encodeURIComponent(source)}`
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '#concert-site') return { shortCircuit: true, url: dataModule('export const concertSite = globalThis.cityDisplayFixtures.site') }
    if (specifier.endsWith('/connection.js')) return { shortCircuit: true, url: dataModule('export default globalThis.cityDisplayFixtures.db') }
    return next(specifier, context)
  } })
  let facets, origins, concerts, map
  try {
    facets = (await import('../layers/concerts/server/api/get-concert-filter-options.js')).default
    origins = (await import('../layers/concerts/server/api/get-area-cities.js')).default
    concerts = (await import('../layers/concerts/server/api/get-concerts.js')).default
    map = (await import('../layers/concerts/server/api/get-concert-map.js')).default
  } finally { hooks.deregister() }
  const options = async query => (await facets({ query: { type: 'city', ...query } })).items

  await t.test('same-country homonyms have separate counts, IDs and searchable labels', async () => {
    const cities = await options({ q: 'athen' })
    assert.deepEqual(cities.filter(c => c.country_code === 'US').map(c => [c.value, c.label, c.count]), [
      ['861', 'Athens (Georgia)', 3], ['3745', 'Athens (Ohio)', 1],
    ])
    assert.equal(cities.find(c => c.country_code === 'GR').value, 'Athens,GR')
    assert.equal(cities[0].secondaryLabel, 'United States')
    assert.deepEqual((await options({ q: 'Athéns Géorgia' })).map(c => c.value), ['861'])
    assert.deepEqual((await options({ q: 'athen', country: 'US' })).map(c => c.value), ['861', '3745'])
    assert.equal((await options({ q: 'Wien' }))[0].value, 'Vienna,AT')
    assert.equal((await options({ q: 'Shared' }))[0].value, '5', 'a local-name alias without concerts or coordinates still creates ambiguity')
  })

  await t.test('selection restoration retains labels and legacy aggregate links stay ambiguous', async () => {
    const restored = (await options({ q: 'Vienna', selected: '3745' })).find(c => c.value === '3745')
    assert.equal(restored.label, 'Athens (Ohio)')
    assert.equal(restored.count, 1)
    const empty = (await options({ q: 'Vienna', selected: '3745', dateFrom: '2099-01-01' })).find(c => c.value === '3745')
    assert.equal(empty.label, 'Athens (Ohio)')
    assert.equal(empty.count, 0)
    const legacy = (await options({ q: 'Vienna', selected: 'Athens,US' })).find(c => c.value === 'Athens,US')
    assert.equal(legacy.label, 'Athens')
    assert.equal(legacy.count, 4)
    assert.equal((await concerts({ query: { city: 'Athens,US' } })).total, 4)
    await assert.rejects(concerts({ query: { city: 'Athens,US', radius: '25' } }), { statusCode: 400 })
  })

  await t.test('both Athens IDs resolve exact results and independent radius origins across map/list', async () => {
    for (const [id, label, latitude, total] of [['861', 'Athens (Georgia)', 33.96095, 3], ['3745', 'Athens (Ohio)', 39.32924, 1]]) {
      const exact = await concerts({ query: { city: id } })
      assert.equal(exact.total, total)
      assert.ok(exact.items.every(c => c.city_id === id))
      const area = await concerts({ query: { city: id, radius: '25' } })
      assert.equal(area.total, total)
      assert.equal(area.area.label, label)
      assert.equal(area.area.latitude, latitude)
      const item = (await map({ query: { city: id } })).items[0]
      assert.equal(item.name, label)
      assert.equal(item.cityQuery, id)
      const origin = (await origins({ query: { origin: id } })).items[0]
      assert.equal(origin.label, label)
      assert.equal(origin.cityQuery, id)
    }
    assert.equal((await origins({ query: { q: 'Athens Ohio' } })).items[0].value, '3745')
    assert.deepEqual((await origins({ query: { origin: 'Athens,US' } })).items, [])
  })

  await t.test('Slovak site retains localization and country scope', async () => {
    Object.assign(site, { country: 'SK', locale: 'sk-SK', cityRoutes: 'local' })
    assert.deepEqual(await options({ q: 'Athens' }), [])
    assert.equal((await options({ q: 'Bratislava' }))[0].label, 'Bratislava')
    assert.deepEqual((await origins({ query: { q: 'Athens', selected: '861' } })).items, [])
    assert.equal((await concerts({ query: { city: '861' } })).total, 0)
  })
})
