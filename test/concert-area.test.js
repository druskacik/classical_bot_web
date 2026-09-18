import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { distanceKm, citiesWithinArea, areaQuery, clearAreaQuery } from '../layers/concerts/shared/utils/concert-area.js'
import { parseArea, resolveArea, publicArea } from '../layers/concerts/server/utils/concert-area.js'
import { parseConcertFilters, applyFilters, facetFilters } from '../layers/concerts/server/utils/concert-filters.js'
import { concertFilterCacheInput, siteDataCacheKey } from '../layers/concerts/server/utils/data-cache-keys.js'
import { concertAreaLocation, normalizeAreaLocation, concertCityLocation, concertCountryLocation, concertComposerLocation, concertWorkLocation, updateConcertQuery } from '../layers/concerts/app/utils/concert-discovery.js'

globalThis.createError = details => Object.assign(new Error(details.statusMessage), details)
const cities = [
  { id: 2, english_name: 'Bratislava', local_name: 'Bratislava', country_code: 'SK', latitude: 48.14816, longitude: 17.10674 },
  { id: 25, english_name: 'Vienna', local_name: 'Wien', country_code: 'AT', latitude: 48.20849, longitude: 16.37208 },
  { id: 1, english_name: 'Prague', local_name: 'Praha', country_code: 'CZ', latitude: 50.08804, longitude: 14.42076 },
]
const origin = { latitude: 0, longitude: 0 }
test('distance boundaries, antimeridian, poles and incomplete coordinates', () => {
  assert.equal(distanceKm(origin, origin), 0)
  const at = { id: 1, latitude: 0, longitude: 1 }
  const radiusKm = distanceKm(origin, at)
  assert.deepEqual(citiesWithinArea([at], { ...origin, radiusKm }), ['1'])
  assert.deepEqual(citiesWithinArea([at], { ...origin, radiusKm: radiusKm - .001 }), [])
  assert.deepEqual(citiesWithinArea([at], { ...origin, radiusKm: radiusKm + .001 }), ['1'])
  assert.ok(distanceKm({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 }) < 23)
  assert.ok(distanceKm({ latitude: 89.9, longitude: 0 }, { latitude: 89.9, longitude: 180 }) < 23)
  assert.ok(Number.isFinite(distanceKm(origin, { latitude: 0, longitude: 180 })))
  assert.deepEqual(citiesWithinArea([{ id: 3, latitude: null, longitude: 0 }, { id: 4, latitude: 91, longitude: 0 }, { id: 5, latitude: NaN, longitude: 0 }], { ...origin, radiusKm: 500 }), [])
})
test('one complete, validated origin is required; invalid areas cannot broaden a search', () => {
  assert.equal(parseArea({}), null)
  assert.deepEqual(parseArea({ nearCity: '2', radiusKm: '100' }), { cityId: '2', radiusKm: 100 })
  assert.deepEqual(parseArea({ nearLat: '0', nearLng: '0', radiusKm: '1' }), { ...origin, radiusKm: 1 })
  for (const query of [
    { nearCity: '2' }, { radiusKm: '100' }, { nearCity: '0', radiusKm: '100' },
    { nearCity: '2', nearLat: '1', nearLng: '1', radiusKm: '100' },
    { nearLat: '48', radiusKm: '100' }, { nearLat: '', nearLng: '0', radiusKm: '100' },
    { nearLat: '91', nearLng: '0', radiusKm: '100' }, { nearLat: '0', nearLng: '-181', radiusKm: '100' },
    { nearLat: 'Infinity', nearLng: '0', radiusKm: '100' }, { nearCity: ['2','1'], radiusKm: '100' },
    ...['0','501','1.5','NaN',''].map(radiusKm => ({ nearCity: '2', radiusKm })),
    ...['city','country','cityId'].map(key => ({ nearCity: '2', radiusKm: '100', [key]: key === 'country' ? 'SK' : '2' })),
  ]) assert.throws(() => parseArea(query), { statusCode: 400 }, JSON.stringify(query))
  assert.throws(() => resolveArea({ cityId: '999', radiusKm: 100 }, cities), { statusCode: 400 })
})
test('city and point origins agree and shared SQL retains server site scope', () => {
  const parsed = parseConcertFilters({ nearCity: '2', radiusKm: '100', composers: 'Mozart', works: '1,2' })
  const area = resolveArea(parsed.area, cities)
  assert.deepEqual(area.cityIds, ['2', '25'])
  assert.deepEqual(resolveArea({ ...cities[0], cityId: undefined, radiusKm: 100 }, cities).cityIds, area.cityIds)
  assert.equal(publicArea(area).cityIds, undefined)
  const db = knex({ client: 'pg' })
  for (const siteCountry of [null, 'SK']) {
    const filters = parseConcertFilters({ nearCity: '2', radiusKm: '100', composers: 'Mozart', works: '1,2' }, siteCountry)
    filters.area = area
    const query = applyFilters(db('classical_concert as cc'), filters).toSQL()
    assert.match(query.sql, /"cc"\."city_id" in/)
    assert.ok(query.bindings.includes('25'))
    assert.equal(query.sql.includes('"cc"."country_code_resolved" = ?'), siteCountry === 'SK')
    assert.equal((query.sql.match(/exists \(/g) || []).length, 2)
    for (const facet of ['country','city','composer','work']) assert.deepEqual(facetFilters(filters, facet).area, area)
  }
  const empty = applyFilters(db('classical_concert as cc'), { ...parsed, area: { ...area, cityIds: [] } }).toSQL()
  assert.match(empty.sql, /1 = \?/)
  assert.ok(empty.bindings.includes(0))
})
test('cache identity follows the origin, distance, resolved coordinates and site', () => {
  const filters = parseConcertFilters({ nearCity: '2', radiusKm: '100' })
  filters.area = resolveArea(filters.area, cities)
  const original = concertFilterCacheInput(filters)
  for (const change of [{ radiusKm: 50 }, { latitude: 1 }, { longitude: 1 }, { cityId: '25' }]) {
    assert.notDeepEqual(concertFilterCacheInput({ ...filters, area: { ...filters.area, ...change } }), original)
  }
  assert.notEqual(siteDataCacheKey({ country: null }, original), siteDataCacheKey({ country: 'SK' }, original))
})
test('area navigation resets geography/page, preserves music/dates, and round trips both origin forms', () => {
  const query = { city: 'Vienna,AT', country: 'AT', composers: 'Mozart', works: '4', datePreset: 'week', dateFrom: '2026-09-17', page: '3' }
  const area = { cityId: '2', radiusKm: 100 }
  const next = concertAreaLocation(query, area)
  assert.equal(next.path, '/')
  assert.deepEqual(next.query, { composers: 'Mozart', works: '4', datePreset: 'week', dateFrom: '2026-09-17', nearCity: '2', radiusKm: '100' })
  assert.deepEqual(normalizeAreaLocation('/austria/vienna', next.query), next)
  assert.equal(normalizeAreaLocation('/', next.query), null)
  const pointQuery = concertAreaLocation(next.query, { latitude: 0, longitude: 179.9, radiusKm: 25 }).query
  assert.equal(pointQuery.nearCity, undefined)
  assert.deepEqual(areaQuery(parseArea(pointQuery)), { nearLat: '0', nearLng: '179.9', radiusKm: '25' })
  assert.equal(concertCityLocation(next.query, { city_path: '/austria/vienna' }).query.nearCity, undefined)
  assert.equal(concertCountryLocation(next.query, 'AT').query.nearCity, undefined)
  assert.equal(concertComposerLocation({ path: '/', query: next.query }, 'Bach').query.nearCity, '2')
  assert.equal(concertWorkLocation({ path: '/', query: next.query }, 9).query.nearCity, '2')
  assert.equal(updateConcertQuery(next.query, { dateFrom: '2026-09-18' }).nearCity, '2')
  const cleared = updateConcertQuery(next.query, clearAreaQuery())
  assert.equal(cleared.nearCity, undefined)
  assert.equal(cleared.composers, 'Mozart')
})
