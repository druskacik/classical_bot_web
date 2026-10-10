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

  await t.test('country scopes map markers, viewport programmes and music facets', async () => {
    await db('composer').insert([{ id: 1, name: 'Austria Composer', normalized_name: 'austria composer' }, { id: 2, name: 'Slovakia Composer', normalized_name: 'slovakia composer' }])
    await db('work').insert([{ id: 1, composer_id: 1, title: 'Austria Work', normalized_title: 'austria work' }, { id: 2, composer_id: 2, title: 'Slovakia Work', normalized_title: 'slovakia work' }])
    for (const [city, music] of [[4, 1], [7, 2]]) {
      const concert = await db('classical_concert').where('city_id', city).first()
      await db('classical_concert_composer').insert({ classical_concert_id: concert.id, composer_id: music })
      await db('classical_concert_work').insert({ classical_concert_id: concert.id, work_id: music })
    }
    for (const [country, city, music] of [['AT', '4', '1'], ['SK', '7', '2']]) {
      assert.deepEqual((await map({ query: { country } })).items.map(c => c.id), [city])
      const query = { country, bounds: '10,40,20,55' }
      const result = await concerts({ query })
      assert.equal(result.total, 1)
      assert.equal(result.items[0].city_id, city)
      assert.equal((await concerts({ query: { country, city } })).total, 1)
      for (const type of ['composer', 'work']) {
        const items = (await facets({ query: { country, type } })).items
        assert.equal(items.length, 1)
        assert.equal(String(items[0].value), type === 'work' ? music : country === 'AT' ? 'Austria Composer' : 'Slovakia Composer')
      }
    }
    assert.equal((await concerts({ query: { city: 'Bratislava,SK', radius: '100' } })).total, 2, 'global radius crosses the Austria/Slovakia border')
  })

  await t.test('exact names treat wildcard and escape characters literally in canonical and raw cities', async () => {
    assert.equal((await concerts({ query: { city: '%,US' } })).total, 0)
    for (const [offset, name] of ['%', '_', 'Back\\Slash', 'MiXeD'].entries()) {
      const id = 100 + offset
      await db('city').insert({ id, english_name: name, local_name: `Local${name}`, country_code: 'CZ', latitude: 50, longitude: 14 })
      await db('classical_concert').insert([
        { city_id: id, city_raw: 'Different', country_code_resolved: 'CZ' },
        { city_raw: name, country_code_raw: 'CZ' },
        { city_raw: name, country_code_raw: 'AT' },
        { city_id: 4, city_raw: name, country_code_resolved: 'AT' },
      ])
      for (const country of [',CZ', '']) {
        assert.equal((await concerts({ query: { city: `${name.toLowerCase()}${country}` } })).total, country ? 2 : 4)
        assert.equal((await concerts({ query: { city: `local${name.toLowerCase()}${country}` } })).total, 1)
      }
      assert.equal((await concerts({ query: { city: String(id) } })).total, 1)
    }
    assert.equal((await concerts({ query: { city: 'BackSlash,CZ' } })).total, 0)
    assert.equal((await concerts({ query: { city: 'Athens,US' } })).total, 4)
  })

  await t.test('unresolved suggestions use exact filter counts, country fallback and radius metadata', async () => {
    await db('classical_concert').insert([
      { city_raw: 'Nové Město nad Metují', country_code_raw: 'CZ' },
      { city_raw: 'Nové Město nad Metují', country_code_resolved: 'CZ', country_code_raw: 'AT' },
      { city_raw: 'NOVÉ MĚSTO NAD METUJÍ', country_code_raw: 'AT' },
      { city_raw: 'Vienna', country_code_raw: 'AT' },
      { city_raw: 'VIENNA', country_code_raw: 'AT' },
      { city_raw: 'Athens', country_code_raw: 'US' },
      { city_raw: 'Unlinked Slovak City', country_code_resolved: 'SK' },
      { city_raw: 'No country' }, { city_raw: '   ', country_code_raw: 'CZ' },
      { city_raw: 'Invalid country', country_code_raw: 'INVALID' },
      { city_raw: 'Hidden rejected', country_code_raw: 'CZ', inclusion_status: 'rejected' },
      { city_raw: 'Hidden duplicate', country_code_raw: 'CZ', duplicate_of_id: 1 },
      { city_raw: 'Hidden past', country_code_raw: 'CZ', date: '2000-01-01' },
    ])
    const found = await options({ q: 'nove mesto nad metuji' })
    assert.equal(found.length, 2)
    const czech = found.find(item => item.country_code === 'CZ')
    assert.equal(czech.value, 'Nové Město nad Metují,CZ')
    assert.equal(czech.secondaryLabel, 'Czechia')
    assert.equal(czech.count, 2)
    assert.equal(czech.radiusAvailable, false)
    assert.equal((await concerts({ query: { city: czech.value } })).total, czech.count)
    assert.equal((await options({ q: 'nove', country: 'CZ' }))[0].count, 1, 'existing resolved-country scope remains unchanged')
    for (const query of [{ q: 'hidden' }, { q: 'no country' }, { q: 'invalid country' }, { q: 'nove', composers: 'Austria Composer' }, { q: 'nove', works: '1' }, { q: 'nove', dateFrom: '2099-01-01' }]) assert.deepEqual(await options(query), [])
    const selected = (await options({ q: 'Vienna', selected: czech.value, dateFrom: '2099-01-01' })).find(item => item.value === czech.value)
    assert.equal(selected.count, 0)
    assert.equal(selected.radiusAvailable, false)
    const vienna = await options({ q: 'vienna' })
    assert.equal(vienna.length, 1)
    assert.equal(vienna[0].label, 'Vienna')
    assert.equal(vienna[0].radiusAvailable, true)
    const restored = await options({ q: 'vienna', selected: 'VIENNA,AT' })
    assert.equal(restored.length, 1)
    assert.equal(restored[0].value, 'VIENNA,AT')
    const athens = await options({ q: 'athens' })
    assert.equal(athens.find(item => item.value === 'Athens,US').radiusAvailable, false)
    assert.equal(athens.find(item => item.value === '861').radiusAvailable, true)
    assert.equal((await options({ selected: '6' })).find(item => item.value === '6').radiusAvailable, false)
    for (const item of [...vienna, ...athens, ...found]) {
      assert.equal(item.count, (await concerts({ query: { city: item.value } })).total, item.value)
    }
    assert.deepEqual((await origins({ query: { q: 'nove mesto' } })).items, [])
    await assert.rejects(concerts({ query: { city: czech.value, radius: '25' } }), { statusCode: 400 })
    const raw = Array.from({ length: 22 }, (_, i) => ({ city_raw: `Limit city ${String(i).padStart(2, '0')}`, country_code_raw: 'CZ' }))
    await db('classical_concert').insert([...raw, ...Array.from({ length: 4 }, () => raw[21])])
    const limited = await options({ q: 'Limit city' })
    assert.equal(limited.length, 20)
    assert.equal(limited[0].count, 5)
    assert.equal(limited[0].value, 'Limit city 21,CZ')
  })

  await t.test('Slovak site retains localization and country scope', async () => {
    Object.assign(site, { country: 'SK', locale: 'sk-SK', cityRoutes: 'local' })
    assert.deepEqual(await options({ q: 'Athens' }), [])
    const unresolved = await options({ q: 'Unlinked Slovak' })
    assert.equal(unresolved[0].value, 'Unlinked Slovak City,SK')
    assert.equal(unresolved[0].radiusAvailable, false)
    assert.deepEqual(await options({ q: 'nove' }), [])
    assert.deepEqual(await options({ selected: 'Nové Město nad Metují,CZ' }), (await options({})))
    const restored = await options({ selected: 'Unlinked Slovak City,SK', dateFrom: '2099-01-01' })
    assert.equal(restored[0].count, 0)
    assert.equal(restored[0].radiusAvailable, false)
    assert.equal((await options({ q: 'Bratislava' }))[0].label, 'Bratislava')
    assert.deepEqual((await origins({ query: { q: 'Athens', selected: '861' } })).items, [])
    assert.equal((await concerts({ query: { city: '861' } })).total, 0)
    assert.equal((await concerts({ query: { city: 'Bratislava,SK', radius: '100' } })).total, 1)
    await assert.rejects(map({ query: { country: 'AT' } }), { statusCode: 400 })
  })

  await t.test('quoted composers survive facets, list/map, restoration and alert criteria on both sites', async () => {
    const { serializeComposerSelections } = await import('../layers/concerts/shared/utils/concert-query.js')
    const { criteria, matching } = await import('../server/utils/alerts/criteria.js')
    const { criteriaIdentity } = await import('../server/utils/alerts/service.js')
    const names = ['Joseph Bologne, Chevalier de Saint-Georges', 'Louis F. "Chip" Davis, Jr.']
    await db('composer').insert(names.map((name, i) => ({ id: 100 + i, name, normalized_name: name.toLowerCase() })))
    await db('work').insert({ id: 100, composer_id: 100, title: 'Comma Work', normalized_title: 'comma work' })
    for (const country of ['AT', 'SK']) {
      for (let i = 0; i < names.length; i++) {
        const [row] = await db('classical_concert').insert({ city_id: country === 'AT' ? 4 : 7, country_code_resolved: country }).returning('id')
        await db('classical_concert_composer').insert({ classical_concert_id: row.id, composer_id: 100 + i })
        if (!i) await db('classical_concert_work').insert({ classical_concert_id: row.id, work_id: 100 })
      }
    }
    for (const country of [null, 'SK']) {
      Object.assign(site, { country, locale: country ? 'sk-SK' : 'en-GB' })
      const expected = country ? 1 : 2
      for (const name of names) {
        const composers = serializeComposerSelections([name])
        const items = (await facets({ query: { type: 'composer', q: name.slice(0, 6), selected: composers } })).items
        assert.equal(items.find(item => item.value === name).count, expected)
        assert.equal((await concerts({ query: { composers } })).total, expected)
        assert.equal((await map({ query: { composers } })).total, expected)
        const restored = (await facets({ query: { type: 'composer', q: 'no match', selected: composers, dateFrom: '2099-01-01' } })).items
        assert.deepEqual(restored.map(item => [item.value, item.count]), [[name, 0]])
        const query = { composers, ...(country ? { country } : {}) }
        const saved = await criteria(db, query)
        assert.deepEqual(saved.filters.composers, [name])
        assert.ok(saved.summary.includes(name))
        assert.equal((await matching(db, saved.filters)).length, expected)
        const reloaded = await criteria(db, JSON.parse(JSON.stringify(saved.query)))
        assert.equal(criteriaIdentity(saved), criteriaIdentity(reloaded))
      }
      const composers = serializeComposerSelections(names)
      assert.equal((await concerts({ query: { composers } })).total, expected * 2)
      const works = (await facets({ query: { type: 'work', composers: serializeComposerSelections([names[0]]) } })).items
      assert.deepEqual(works.map(item => [item.value, item.count]), [['100', expected]])
    }
    Object.assign(site, { country: null, locale: 'en-GB' })
  })

  await t.test('commas in canonical and unresolved cities preserve exact names and radius origins', async () => {
    await db('city').insert({ id: 9000, english_name: 'Test City, District', local_name: 'Test City, District', country_code: 'US', latitude: 20, longitude: 20 })
    await db('classical_concert').insert([
      { city_id: 9000, country_code_resolved: 'US' },
      { city_raw: 'Washington, D.C.', country_code_raw: 'US' },
    ])
    for (const value of ['Test City, District,US', 'Washington, D.C.,US']) {
      const restored = (await options({ q: 'no match', selected: value })).find(item => item.value === value)
      assert.equal(restored.count, 1)
      assert.equal((await concerts({ query: { city: value } })).total, 1)
    }
    const area = await concerts({ query: { city: 'Test City, District,US', radius: '25' } })
    assert.equal(area.total, 1)
    assert.equal(area.area.label, 'Test City, District')
  })

})
