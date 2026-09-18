import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { clusterMapCities, nearestMapLongitude, parseMapBounds, serializeMapBounds, withinMapBounds } from '../layers/concerts/shared/utils/concert-map.js'
import { parseConcertFilters, applyFilters } from '../layers/concerts/server/utils/concert-filters.js'
import { concertFilterCacheInput } from '../layers/concerts/server/utils/data-cache-keys.js'
globalThis.createError = fields => Object.assign(new Error(fields.statusMessage), fields)
test('map bounds validate, round trip, and include both sides of the date line', () => {
  const b = parseMapBounds('170,-10,-170,10')
  assert.equal(serializeMapBounds(b), '170,-10,-170,10')
  assert.equal(withinMapBounds({ latitude: 0, longitude: 179 }, b), true)
  assert.equal(withinMapBounds({ latitude: 0, longitude: -179 }, b), true)
  assert.equal(withinMapBounds({ latitude: 0, longitude: 0 }, b), false)
  assert.equal(withinMapBounds({ latitude: 11, longitude: 179 }, b), false)
  for (const value of ['', '1,2,3', '0,10,20,-10', '-181,-10,180,10', '0,-91,10,10', '0,0,0,10', ['0,0,10,10']]) assert.throws(() => parseMapBounds(value))
})
test('clusters account for every city and concert exactly once', () => {
  const cities = [{ id: '1', latitude: 1, longitude: 1, count: 5 }, { id: '2', latitude: 2, longitude: 2, count: 9 }, { id: '3', latitude: 40, longitude: 40, count: 2 }]
  const groups = clusterMapCities(cities, city => ({ x: city.longitude * 10, y: city.latitude * 10 }))
  assert.deepEqual(groups.map(group => group.count), [14, 2])
  assert.equal(groups.flatMap(group => group.cities).length, 3)
  assert.equal(groups[0].latitude, 1.5)
})
test('viewport queries remain scoped and cache keys distinguish viewports', () => {
  const db = knex({ client: 'pg' })
  const a = parseConcertFilters({ bounds: '170,-10,-170,10', composers: 'Mozart' }, 'SK')
  const sql = applyFilters(db('classical_concert as cc'), a).toSQL()
  assert.match(sql.sql, /"canonical_city"\."latitude" between/)
  assert.match(sql.sql, /"canonical_city"\."longitude" >= \? or "canonical_city"\."longitude" <= \?/)
  assert.ok(sql.bindings.includes('SK'))
  assert.ok(sql.bindings.includes('Mozart'))
  assert.notDeepEqual(concertFilterCacheInput(a), concertFilterCacheInput({ ...a, bounds: parseMapBounds('0,0,10,10') }))
})

test('world-copy positions and cluster centres stay near the date line', () => {
  assert.equal(nearestMapLongitude(-179, 180), 181)
  assert.equal(nearestMapLongitude(179, -180), -181)
  const group = clusterMapCities([{ id: '1', latitude: 0, longitude: 179, count: 2 }, { id: '2', latitude: 0, longitude: -179, count: 3 }], () => ({ x: 1, y: 1 }))[0]
  assert.equal(Math.abs(group.longitude), 180)
  assert.equal(group.count, 5)
})
