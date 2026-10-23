import { withServingSnapshot } from '../layers/concerts/server/utils/serving-catalogue.js'
import { installResolvedFixture, publishResolvedFixture } from '../test-support/resolved-fixture.js'
import { composerPath, composerConcertLocation } from '../shared/utils/composers.js'
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
  t.after(async () => { await db.destroy(); await admin.raw('DROP SCHEMA IF EXISTS serving CASCADE'); await admin.raw(`DROP SCHEMA ${schema} CASCADE`); await admin.destroy() })
  const oldCache = process.env.SERVER_DATA_CACHE_ENABLED
  process.env.SERVER_DATA_CACHE_ENABLED = 'false'
  t.after(() => { if (oldCache === undefined) delete process.env.SERVER_DATA_CACHE_ENABLED; else process.env.SERVER_DATA_CACHE_ENABLED = oldCache })
  await db.raw(`CREATE TABLE city (id bigint PRIMARY KEY, english_name text, local_name text, display_name text, country_code text, latitude double precision, longitude double precision);
    CREATE TABLE classical_concert (id serial PRIMARY KEY, city_id bigint REFERENCES city, city_raw text, country_code_resolved text, country_code_raw text, date date DEFAULT CURRENT_DATE + 30, inclusion_status text DEFAULT 'included', duplicate_of_id integer, title text DEFAULT 'Concert', url text DEFAULT 'https://example.org', time_from time, time_to time, source text, source_url text, venue text);
    CREATE TABLE composer (id integer PRIMARY KEY, name text, normalized_name text);
    CREATE TABLE work (id integer PRIMARY KEY, composer_id integer, title text, normalized_title text);
    CREATE TABLE classical_concert_composer (classical_concert_id integer, composer_id integer);
    CREATE TABLE classical_concert_work (classical_concert_id integer, work_id integer);
    CREATE TABLE composer_spotify_playlist (id integer PRIMARY KEY, composer_id integer, status text, is_public boolean,
      spotify_playlist_id text, season_start date, season_end date, last_synced_at timestamptz);
    CREATE TABLE composer_spotify_playlist_item (playlist_id integer);`)
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
  await installResolvedFixture(db)
  const site = { country: null, locale: 'en-GB', cityRoutes: 'global' }
  globalThis.cityDisplayFixtures = { db, site }
  globalThis.defineEventHandler = handler => handler
  globalThis.getQuery = event => event.query
  globalThis.createError = fields => Object.assign(new Error(fields.statusMessage), fields)
  const dataModule = source => `data:text/javascript,${encodeURIComponent(source)}`
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '#concert-site') return { shortCircuit: true, url: dataModule('export const concertSite = globalThis.cityDisplayFixtures.site') }
    if (specifier.endsWith('/connection.js')) return { shortCircuit: true, url: dataModule('export default globalThis.cityDisplayFixtures.db') }
    if (specifier.startsWith('#layers/concerts/')) return next(new URL(`../layers/concerts/${specifier.slice('#layers/concerts/'.length)}`, import.meta.url).href, context)
    if (specifier.startsWith('#shared/')) return next(new URL(`../shared/${specifier.slice('#shared/'.length)}`, import.meta.url).href, context)
    return next(specifier, context)
  } })
  let facets, origins, concerts, map, getComposerDirectory, getSitemapInventory
  try {
    facets = (await import('../layers/concerts/server/api/get-concert-filter-options.js')).default
    origins = (await import('../layers/concerts/server/api/get-area-cities.js')).default
    concerts = (await import('../layers/concerts/server/api/get-concerts.js')).default
    map = (await import('../layers/concerts/server/api/get-concert-map.js')).default
    ;({ getComposerDirectory } = await import('../server/utils/composers.js'))
    ;({ getSitemapInventory } = await import('../server/utils/sitemap-inventory.js'))
  } finally { hooks.deregister() }
  // Keep direct handlers for tests that deliberately hold a publication fixed.
  const snapshotHandlers = { facets, concerts, map }
  const published = handler => async event => { await publishResolvedFixture(db); return handler(event) }
  facets = published(facets); concerts = published(concerts); map = published(map)
  const options = async query => (await facets({ query: { type: 'city', ...query } })).items

  await t.test('both sites list donor-only programme and filter it without multiplying pages', async () => {
    await db('composer').insert({ id: 900, name: 'Snapshot Composer', normalized_name: 'snapshot composer' })
    await db('work').insert([{ id: 900, composer_id: 900, title: 'Donated Sonata', normalized_title: 'donated sonata' }, { id: 901, composer_id: 900, title: 'Donated Symphony', normalized_title: 'donated symphony' }])
    const [primary] = await db('classical_concert').insert({ title: 'Resolved listing', city_id: 7, country_code_resolved: 'SK' }).returning('id')
    const [donor] = await db('classical_concert').insert({ duplicate_of_id: primary.id, city_id: 7, country_code_resolved: 'SK' }).returning('id')
    await db('classical_concert_work').insert([900, 901].map(work_id => ({ classical_concert_id: donor.id, work_id })))
    for (const country of [null, 'SK']) {
      site.country = country
      const query = { composers: 'Snapshot Composer', works: '900,901' }
      const result = await concerts({ query })
      assert.equal(result.total, 1)
      assert.equal(result.items[0].id, primary.id)
      assert.equal(result.items[0].works.length, 2)
      assert.deepEqual(result.items[0].composers, [{ id: 900, name: 'Snapshot Composer' }])
      const suggestions = await facets({ query: { ...query, type: 'work' } })
      assert.ok(suggestions.items.filter(w => ['900','901'].includes(w.value)).every(w => w.count === 1))
      assert.equal((await map({ query })).total, 1)
    }
    site.country = null
    await db('classical_concert_work').where('classical_concert_id', donor.id).delete()
    await db('classical_concert').whereIn('id', [primary.id, donor.id]).delete()
    await db('work').whereIn('id', [900, 901]).delete()
    await db('composer').where('id', 900).delete()
  })

  await t.test('composer identities align facets, navigation, sitemaps and subject resolution through publication changes', async t => {
    site.subjectDiscovery = true
    const oldName = 'Élodie Original', newName = 'Élodie Renamed'
    await db('composer').insert([
      { id: 910, name: oldName, normalized_name: 'elodie original' },
      { id: 911, name: 'Catalogue Original', normalized_name: 'catalogue original' },
    ])
    await db('composer_spotify_playlist').insert({ id: 910, composer_id: 910, status: 'published', is_public: true,
      spotify_playlist_id: '1234567890123456789012', season_start: '2026-07-01', season_end: '2027-07-01' })
    await db('work').insert({ id: 910, composer_id: 910, title: 'Published Sonata', normalized_title: 'published sonata' })
    const rows = await db('classical_concert').insert(Array.from({ length: 2 }, () => ({ title: 'Published programme', city_id: 7, country_code_resolved: 'SK' }))).returning('id')
    const ids = rows.map(row => row.id)
    await db('classical_concert_work').insert(ids.map(classical_concert_id => ({ classical_concert_id, work_id: 910 })))
    t.after(async () => {
      site.country = null
      delete site.subjectDiscovery
      await db('composer_spotify_playlist').where('id', 910).delete()
      await db('classical_concert_work').whereIn('classical_concert_id', ids).delete()
      await db('classical_concert').whereIn('id', ids).delete()
      await db('work').where('id', 910).delete()
      await db('composer').whereIn('id', [910, 911, 912, 913]).delete()
      await publishResolvedFixture(db)
    })
    await publishResolvedFixture(db)
    const { published_at } = await db('resolved_concert_refresh_state').first()
    await db('composer').where('id', 910).update({ name: newName, normalized_name: 'elodie renamed' })
    await db('composer').where('id', 911).update({ name: 'Catalogue Renamed', normalized_name: 'catalogue renamed' })
    const suggest = async query => (await snapshotHandlers.facets({ query: { type: 'composer', ...query } })).items
    const total = async name => (await snapshotHandlers.concerts({ query: { composers: name } })).total
    const navigation = async (name, absentName) => {
      const directory = await getComposerDirectory()
      const profile = directory.find(composer => composer.id === 910)
      assert.equal(profile.name, name)
      assert.equal(profile.concertCount, 2)
      assert.equal(profile.path, composerPath(910, name))
      const browse = new URL(composerConcertLocation(profile.name), 'https://example.test')
      const listing = await snapshotHandlers.concerts({ query: Object.fromEntries(browse.searchParams) })
      assert.equal(listing.total, profile.concertCount, 'the profile browse link matches its resolved count')
      assert.equal(listing.discovery.status, 'resolved')
      assert.equal(listing.discovery.subject.id, 910)
      assert.equal(listing.discovery.subject.name, name)
      assert.equal(listing.discovery.subject.profilePath, profile.path)
      const work = await snapshotHandlers.concerts({ query: { works: '910' } })
      assert.equal(work.discovery.subject.composerName, name)
      const catalogueOnly = await snapshotHandlers.concerts({ query: { composers: 'Catalogue Renamed' } })
      assert.equal(catalogueOnly.total, 0)
      assert.equal(catalogueOnly.discovery.status, 'resolved')
      assert.equal(catalogueOnly.discovery.subject.profilePath, null)
      const sitemap = await getSitemapInventory()
      assert.ok(sitemap.some(row => row.loc === profile.path))
      const links = sitemap.map(row => new URL(row.loc, 'https://example.test'))
      assert.ok(!links.some(url => url.searchParams.get('composers') === absentName))
      const composerLinks = links.filter(url => url.searchParams.get('composers') === name)
      assert.equal(composerLinks.length, 3, 'worldwide, country and city subject URLs')
      for (const url of composerLinks) {
        const result = await snapshotHandlers.concerts({ query: Object.fromEntries(url.searchParams) })
        assert.equal(result.total, 2)
        assert.equal(result.discovery.status, 'resolved')
      }
    }

    for (const stale of [false, true]) {
      if (stale) await db('resolved_concert_refresh_state').update({
        published_at: db.raw("now() - interval '1 hour'"), last_failure_at: db.fn.now(), last_error: 'Fixture refresh failure',
      })
      else assert.equal(new Date((await db('resolved_concert_refresh_state').first()).published_at).valueOf(), new Date(published_at).valueOf())
      for (const country of [null, 'SK']) {
        site.country = country
        for (const includeUnavailable of ['false', 'true']) {
          const suggestions = await suggest({ q: 'elodie original', includeUnavailable })
          assert.deepEqual(suggestions, [{ value: oldName, label: oldName, count: 2 }])
          assert.deepEqual(await suggest({ q: 'elodie renamed', includeUnavailable }), [])
        }
        assert.deepEqual(await suggest({ q: 'no match', selected: oldName }), [{ value: oldName, label: oldName, count: 2 }])
        assert.deepEqual(await suggest({ q: 'no match', selected: oldName, dateFrom: '2099-01-01' }), [{ value: oldName, label: oldName, count: 0 }])
        assert.deepEqual(await suggest({ q: oldName, dateFrom: '2099-01-01', includeUnavailable: 'true' }), [{ value: oldName, label: oldName, count: 0 }])
        assert.deepEqual(await suggest({ q: 'Catalogue Renamed', includeUnavailable: 'true' }), [{ value: 'Catalogue Renamed', label: 'Catalogue Renamed', count: 0 }])
        assert.equal(await total(oldName), 2)
        assert.equal(await total(newName), 0)
        const works = (await snapshotHandlers.facets({ query: { type: 'work', composers: oldName, q: 'elodie original' } })).items
        assert.deepEqual(works, [{ value: '910', label: 'Published Sonata', secondaryLabel: oldName, count: 2 }])
        assert.equal((await snapshotHandlers.map({ query: { composers: oldName } })).total, 2)
        await navigation(oldName, newName)
      }
    }
    // Live-only collisions with published names must be ambiguous everywhere;
    // the renamed registry row must neither hide that collision nor create a
    // spurious collision under its new name before publication.
    site.country = null
    await db('composer').insert([
      { id: 912, name: oldName, normalized_name: 'elodie original' },
      { id: 913, name: newName, normalized_name: 'elodie renamed' },
    ])
    const ambiguous = await snapshotHandlers.concerts({ query: { composers: oldName } })
    assert.equal(ambiguous.total, 2)
    assert.equal(ambiguous.discovery.status, 'ambiguous')
    const fallback = await snapshotHandlers.concerts({ query: { composers: newName } })
    assert.equal(fallback.total, 0)
    assert.equal(fallback.discovery.status, 'resolved')
    assert.equal(fallback.discovery.subject.id, 913)
    const ambiguousSitemap = await getSitemapInventory()
    assert.ok(!ambiguousSitemap.some(row => new URL(row.loc, 'https://example.test').searchParams.get('composers') === oldName))
    await db('composer').whereIn('id', [912, 913]).delete()
    await publishResolvedFixture(db)
    for (const country of [null, 'SK']) {
      site.country = country
      assert.deepEqual(await suggest({ q: 'elodie renamed' }), [{ value: newName, label: newName, count: 2 }])
      assert.deepEqual(await suggest({ q: 'elodie original', includeUnavailable: 'true' }), [])
      assert.deepEqual(await suggest({ q: 'no match', selected: newName }), [{ value: newName, label: newName, count: 2 }])
      assert.equal(await total(newName), 2)
      assert.equal(await total(oldName), 0)
      await navigation(newName, oldName)
    }
  })

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

  await t.test('countryless ambiguous radius origins are rejected by listings, maps, facets and alerts', async () => {
    const { criteria } = await import('../server/utils/alerts/criteria.js')
    for (const city of ['Athens', 'ATHENS', 'Athens,US']) {
      const query = { city, radius: '50' }
      await assert.rejects(concerts({ query }), { statusCode: 400 })
      await assert.rejects(map({ query }), { statusCode: 400 })
      await assert.rejects(facets({ query: { ...query, type: 'composer' } }), { statusCode: 400 })
      await assert.rejects(criteria(db, query), { statusCode: 400 })
      assert.deepEqual((await origins({ query: { origin: city } })).items, [])
      const selected = (await options({ selected: city })).find(row => row.value === city)
      assert.equal(selected.radiusAvailable, false)
    }
    for (const city of ['Athens,GR', 'Αθήνα', '861', '3745']) {
      const selected = (await options({ selected: city })).find(row => row.value === city)
      assert.equal(selected.radiusAvailable, true)
      const result = await concerts({ query: { city, radius: '50' } })
      assert.equal(result.area.cityId, /^\d+$/.test(city) ? city : '3')
    }
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
        const items = (await facets({ query: { country, type, includeUnavailable: 'true' } })).items
        assert.equal(items.length, 2)
        assert.equal(items[0].count, 1)
        assert.equal(items[1].count, 0)
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
        assert.equal((await concerts({ query: { city: `${name.toLowerCase()}${country}` } })).total, 2)
        assert.equal((await concerts({ query: { city: `local${name.toLowerCase()}${country}` } })).total, 2)
      }
      assert.equal((await concerts({ query: { city: String(id) } })).total, 2)
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
    for (const query of [{ q: 'no country' }, { q: 'invalid country' }]) assert.deepEqual(await options(query), [])
    for (const query of [{ q: 'hidden' }, { q: 'nove', composers: 'Austria Composer' }, { q: 'nove', works: '1' }, { q: 'nove', dateFrom: '2099-01-01' }]) {
      assert.deepEqual(await options(query), [])
      const items = await options({ ...query, includeUnavailable: 'true' })
      assert.ok(items.length)
      assert.ok(items.every(item => item.count === 0))
    }
    assert.deepEqual((await options({ q: 'hidden', includeUnavailable: 'true' })).map(item => item.label), ['Hidden past'])
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

  await t.test('city facets share the raw-label scan without losing historical aliases or labels', async t => {
    await db('city').insert([
      { id: 29000, english_name: 'Archive East', local_name: 'Archive shared', country_code: 'SK' },
      { id: 29001, english_name: 'Archive West', local_name: 'Archive shared', country_code: 'SK' },
    ])
    const rows = await db('classical_concert').insert([
      { city_id: 29000, country_code_resolved: 'SK' },
      { city_id: 29001, country_code_resolved: 'SK' },
      { city_raw: 'Archive shared', country_code_resolved: 'SK', date: '2000-01-01' },
      { city_raw: 'Archive raw', country_code_resolved: 'SK' },
      { city_raw: 'ARCHIVE RAW', country_code_resolved: 'SK', date: '2000-01-01' },
      { city_raw: 'Archive past only', country_code_resolved: 'SK', date: '2000-01-01' },
    ]).returning('id')
    t.after(async () => {
      site.country = null
      await db('classical_concert').whereIn('id', rows.map(row => row.id)).delete()
      await db('city').whereIn('id', [29000, 29001]).delete()
      await publishResolvedFixture(db)
    })
    await publishResolvedFixture(db)
    const { label } = await db('resolved_concert').whereRaw("LOWER(city_raw) = 'archive raw'").min('city_raw as label').first()
    for (const country of [null, 'SK']) {
      site.country = country
      for (const includeUnavailable of ['false', 'true']) {
        const statements = []
        const capture = query => statements.push(query.sql)
        db.on('query', capture)
        let items
        try {
          ;({ items } = await snapshotHandlers.facets({ query: { type: 'city', q: 'Archive', includeUnavailable } }))
        } finally { db.off('query', capture) }
        const rawScans = statements.filter(sql => sql.includes('serving') && sql.includes('current_raw_city_daily'))
        assert.equal(rawScans.length, 1, 'raw counts and historical names use one grouped query')
        assert.match(rawScans[0], /sum/i)
        assert.equal(items.find(item => item.value === 'Archive shared,SK')?.count, 2,
          'a past-only ambiguous alias still matches upcoming canonical concerts')
        assert.equal(items.find(item => item.value === `${label},SK`)?.count, 1,
          'historical casing still supplies the same label, but only upcoming concerts count')
        assert.equal(items.some(item => item.value === 'Archive past only,SK'), includeUnavailable === 'true')
        for (const item of items) {
          assert.equal(item.count, (await snapshotHandlers.concerts({ query: { city: item.value } })).total)
        }
      }
      const restored = await snapshotHandlers.facets({ query: {
        type: 'city', q: 'unmatched', selected: 'Archive shared,SK', dateFrom: '2099-01-01',
      } })
      assert.deepEqual(restored.items.map(item => [item.value, item.count]), [['Archive shared,SK', 0]])
    }
  })

  await t.test('music facets use scalar composer names and work keys for suggestions and selected counts', async () => {
    await publishResolvedFixture(db)
    const statements = []
    const capture = query => statements.push(query.sql)
    db.on('query', capture)
    try {
      for (const country of [null, 'SK']) {
        site.country = country
        for (const includeUnavailable of ['false', 'true']) {
          for (const type of ['composer', 'work']) {
            const selected = type === 'composer' ? 'Slovakia Composer' : '2'
            const { items } = await snapshotHandlers.facets({ query: { type, q: 'Slovakia', selected, includeUnavailable } })
            assert.equal(items.find(item => item.value === selected)?.count, 1)
          }
        }
      }
    } finally { db.off('query', capture); site.country = null }
    const counts = statements.filter(sql => sql.includes('current_facet_daily'))
    assert.ok(counts.length >= 16, 'suggestions and selected counts use daily summaries')
    assert.ok(counts.every(sql => !sql.includes('jsonb_to_record')))
    assert.ok(counts.every(sql => !sql.includes('current_concert_work')))

  })

  await t.test('Slovak site retains localization and country scope', async () => {
    Object.assign(site, { country: 'SK', locale: 'sk-SK', cityRoutes: 'local' })
    assert.deepEqual(await options({ q: 'Athens' }), [])
    const unresolved = await options({ q: 'Unlinked Slovak' })
    assert.equal(unresolved[0].value, 'Unlinked Slovak City,SK')
    assert.equal(unresolved[0].radiusAvailable, false)
    assert.deepEqual(await options({ q: 'nove' }), [])
    assert.deepEqual(await options({ selected: 'Nové Město nad Metují,CZ' }), (await options({})))
    const restored = (await options({ selected: 'Unlinked Slovak City,SK', dateFrom: '2099-01-01' })).find(item => item.value === 'Unlinked Slovak City,SK')
    assert.equal(restored.count, 0)
    assert.equal(restored.radiusAvailable, false)
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
        assert.equal((await withServingSnapshot(db, trx => matching(trx, saved.filters))).length, expected)
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

  await t.test('catalogue-only music and locations remain discoverable with contextual availability', async () => {
    Object.assign(site, { country: null, locale: 'en-GB' })
    await db('composer').insert([
      { id: 500, name: 'Philip Glass', normalized_name: 'philip glass' },
      ...Array.from({ length: 22 }, (_, i) => ({ id: 501 + i, name: `Philip Glass Ensemble ${i}`, normalized_name: `philip glass ensemble ${i}` })),
      { id: 550, name: 'Émpty_Name', normalized_name: 'empty_name' },
    ])
    await db('work').insert([{ id: 500, composer_id: 500, title: 'Glassworks', normalized_title: 'glassworks' }])
    const query = async input => (await facets({ query: { includeUnavailable: 'true', ...input } })).items
    for (const country of [null, 'SK']) {
      site.country = country
      const found = await query({ type: 'composer', country: 'SK', q: 'Philip Glass' })
      assert.equal(found.length, 20)
      assert.equal(found[0].value, 'Philip Glass')
      assert.equal(found[0].count, 0)
      assert.ok((await query({ type: 'composer', selected: 'Philip Glass', q: 'unmatched' })).some(item => item.value === 'Philip Glass'))
      assert.deepEqual((await query({ type: 'work', composers: 'Philip Glass' })).map(item => [item.value, item.count]), [['500', 0]])
      assert.ok((await query({ type: 'work', composers: 'Austria Composer', selected: '500' })).some(item => item.value === '500'))
      assert.equal((await query({ type: 'composer', q: 'émpty_' }))[0].value, 'Émpty_Name')
      const countries = await query({ type: 'country', composers: 'Philip Glass' })
      assert.ok(countries.some(item => item.value === 'SK' && item.count === 0))
      if (country) assert.ok(countries.every(item => item.value === 'SK'))
      const cities = await query({ type: 'city', country: 'SK', composers: 'Philip Glass', q: 'Bratislava' })
      assert.equal(cities[0].count, 0)
      assert.equal(cities[0].radiusAvailable, true)
      assert.ok(cities.every(item => item.country_code === 'SK'))
      const radius = await query({ type: 'composer', city: 'Bratislava,SK', radius: '25', q: 'Philip Glass' })
      assert.equal(radius[0].value, 'Philip Glass')
      assert.equal(radius[0].count, 0)
    }
    site.country = null
    for (const type of ['country', 'city', 'composer', 'work']) {
      const params = { type, composers: 'Philip Glass' }
      if (type === 'composer') params.q = 'Philip Glass'
      const available = await query({ ...params, includeUnavailable: 'false' })
      assert.ok(available.every(item => item.count > 0), type)
      assert.ok((await query(params)).some(item => item.count === 0), type)
    }
    assert.deepEqual(await query({ type: 'composer', q: 'Philip Glass', includeUnavailable: undefined }), [])
    assert.deepEqual(await query({ type: 'composer', q: 'Philip Glass', includeUnavailable: '1' }), [])
    const restored = await query({ type: 'composer', q: 'unmatched', selected: 'Philip Glass', includeUnavailable: 'false' })
    assert.deepEqual(restored.map(item => [item.value, item.count]), [['Philip Glass', 0]])
    const concert = await db('classical_concert').where({ city_id: 4 }).first()
    await db('classical_concert_composer').insert(Array.from({ length: 22 }, (_, i) => ({ classical_concert_id: concert.id, composer_id: 501 + i })))
    assert.equal((await query({ type: 'composer', q: 'Philip Glass' }))[0].value, 'Philip Glass', 'exact zero-match result outranks 22 available partial matches')
    const browsing = await query({ type: 'composer', q: 'Philip Glass', includeUnavailable: 'false' })
    assert.equal(browsing.length, 20, 'availability filtering happens before the limit')
    assert.ok(browsing.every(item => item.count > 0))

    await db('classical_concert_composer').insert({ classical_concert_id: concert.id, composer_id: 500 })
    await db('classical_concert_work').insert({ classical_concert_id: concert.id, work_id: 500 })
    assert.equal((await query({ type: 'composer', q: 'Philip Glass', country: 'AT' }))[0].count, 1)
    assert.equal((await query({ type: 'work', composers: 'Philip Glass', dateFrom: '2099-01-01' }))[0].count, 0)
    assert.equal((await query({ type: 'composer', q: 'Philip Glass', country: 'SK' }))[0].count, 0)
  })

  await t.test('work suggestions preserve mixed-composer programmes while scoping zero-match catalogue entries', async () => {
    await db('composer').insert([
      { id: 700, name: 'Mozart', normalized_name: 'mozart' },
      { id: 701, name: 'Beethoven', normalized_name: 'beethoven' },
    ])
    await db('work').insert([
      { id: 700, composer_id: 700, title: 'Mozart catalogue work', normalized_title: 'mozart catalogue work' },
      { id: 701, composer_id: 701, title: 'Beethoven shared programme', normalized_title: 'beethoven shared programme' },
      { id: 702, composer_id: 701, title: 'Beethoven catalogue work', normalized_title: 'beethoven catalogue work' },
      { id: 703, composer_id: 701, title: 'Beethoven Austria programme', normalized_title: 'beethoven austria programme' },
    ])
    for (const [country, city, work] of [['SK', 7, 701], ['AT', 4, 703]]) {
      const [concert] = await db('classical_concert').insert({ city_id: city, country_code_resolved: country }).returning('id')
      await db('classical_concert_composer').insert([700, 701].map(composer_id => ({ classical_concert_id: concert.id, composer_id })))
      await db('classical_concert_work').insert({ classical_concert_id: concert.id, work_id: work })
    }
    const works = async query => (await facets({ query: { type: 'work', composers: 'Mozart', includeUnavailable: 'true', ...query } })).items
    for (const country of [null, 'SK']) {
      site.country = country
      const available = await works({})
      assert.equal(available.find(item => item.value === '700').count, 0, 'selected composer catalogue works remain selectable')
      assert.equal(available.find(item => item.value === '701')?.count, 1, 'other composers on matching programmes remain discoverable')
      assert.equal(available.some(item => item.value === '702'), false, 'unrelated zero-match catalogue works stay scoped out')
      assert.equal(available.some(item => item.value === '703'), !country, 'availability observes the site country')
      const searched = await works({ q: 'Beethoven', country: 'SK' })
      assert.deepEqual(searched.map(item => [item.value, item.count]), [['701', 1]], 'text and country restrictions apply to both sides of the eligibility condition')
      assert.equal((await concerts({ query: { composers: 'Mozart', works: '701', country: 'SK' } })).total, searched[0].count)
      assert.deepEqual((await works({ dateFrom: '2099-01-01' })).map(item => [item.value, item.count]), [['700', 0]])
      const restored = await works({ q: 'unmatched', dateFrom: '2099-01-01', selected: '701' })
      assert.deepEqual(restored.map(item => [item.value, item.count]), [['701', 0]])
    }
    site.country = null
  })

  await t.test('city aliases merge before limiting, count all unique aliases, and restore old selections', async () => {
    const { criteria, matching } = await import('../server/utils/alerts/criteria.js')
    await db('city').insert([
      { id: 19000, english_name: 'Prague', local_name: 'Praha', country_code: 'CZ', latitude: 50.08, longitude: 14.43 },
      { id: 19001, english_name: 'Alias town', local_name: 'Shared alias', country_code: 'CZ', latitude: 49, longitude: 15 },
      { id: 19002, english_name: 'Other town', local_name: 'Shared alias', country_code: 'CZ' },
    ])
    await db('classical_concert').insert([
      { city_id: 19000, country_code_resolved: 'CZ' },
      { city_raw: 'Prague', country_code_resolved: 'CZ' },
      { city_raw: 'Wien', country_code_resolved: 'AT' },
      { city_raw: 'Wien', country_code_resolved: 'CZ' },
      { city_raw: 'Praha', country_code_resolved: 'CZ' },
      { city_raw: 'PRAHA', country_code_resolved: 'CZ' },
      { city_raw: 'Praha', country_code_resolved: 'AT' },
      { city_id: 4, city_raw: 'Praha', country_code_resolved: 'AT' },
      { city_raw: 'Praha', country_code_resolved: 'CZ', inclusion_status: 'rejected' },
      { city_raw: 'Praha', country_code_resolved: 'CZ', duplicate_of_id: 1 },
      { city_raw: 'Praha', country_code_resolved: 'CZ', date: '2000-01-01' },
      { city_id: 19001, country_code_resolved: 'CZ' },
      { city_raw: 'Alias town', country_code_resolved: 'CZ' },
      { city_raw: 'Shared alias', country_code_resolved: 'CZ' },
    ])
    for (const q of ['', 'Prague', 'Praha', 'praha']) {
      const rows = (await options({ q })).filter(row => row.country_code === 'CZ' && /prague|praha/i.test(row.label))
      assert.deepEqual(rows.map(row => [row.value, row.label, row.count]), [['Prague,CZ', 'Prague', 4]])
    }
    const vienna = (await options({ q: 'Wien' })).filter(row => row.country_code === 'AT')
    assert.equal(vienna.length, 1)
    assert.equal(vienna[0].value, 'Vienna,AT')
    assert.equal(vienna[0].count, (await concerts({ query: { city: 'Wien,AT' } })).total)
    assert.equal((await concerts({ query: { city: 'Vienna,AT' } })).total, vienna[0].count)
    assert.ok((await options({ q: 'Wien' })).some(row => row.value === 'Wien,CZ'), 'do not guess that a wrong-country raw name belongs to Austria')
    const expectedIds = (await concerts({ query: { city: 'Prague,CZ' } })).items.map(row => row.id).sort()
    for (const city of ['Prague,CZ', 'Praha,CZ', 'PRAHA,CZ', '19000', 'Praha']) {
      const result = await concerts({ query: { city } })
      assert.equal(result.total, 4)
      assert.deepEqual(result.items.map(row => row.id).sort(), expectedIds)
      const restored = (await options({ q: 'Praha', selected: city })).filter(row => row.country_code === 'CZ' && row.label === 'Prague')
      assert.deepEqual(restored.map(row => [row.value, row.count]), [[city, 4]])
      const alert = await criteria(db, { city })
      assert.deepEqual((await withServingSnapshot(db, trx => matching(trx, alert.filters).select('cc.id'))).map(row => row.id).sort(), expectedIds)
      for (const context of [{ dateFrom: '2099-01-01' }, { composers: 'Missing composer' }, { works: '999999' }, { country: 'CZ' }]) {
        const selected = (await options({ ...context, selected: city })).find(row => row.value === city)
        assert.equal(selected.count, (await concerts({ query: { ...context, city } })).total)
      }
    }
    const mapped = await map({ query: { city: 'Praha,CZ' } })
    assert.equal(mapped.total, 4)
    assert.equal(mapped.mapped, 1)
    assert.equal(mapped.unmapped, 3)
    for (const city of ['Prague,CZ', 'Praha,CZ', '19000']) {
      assert.equal((await concerts({ query: { city, radius: '1' } })).total, 4)
    }
    assert.equal((await concerts({ query: { city: 'Alias town,CZ' } })).total, 2, 'ambiguous raw aliases cannot be assigned to one city')
    assert.equal((await concerts({ query: { city: '19001', radius: '1' } })).total, 2, 'a city without coordinates still makes the raw alias ambiguous')
    const ambiguous = await options({ q: 'Shared alias' })
    assert.ok(ambiguous.some(row => row.value === 'Shared alias,CZ'))
    for (const row of ambiguous) assert.equal(row.count, (await concerts({ query: { city: row.value } })).total)
    const radiusAlert = await criteria(db, { city: '19001', radius: '1' })
    assert.equal((await withServingSnapshot(db, trx => matching(trx, radiusAlert.filters).count('* as total').first())).total, '2')
  })

})
