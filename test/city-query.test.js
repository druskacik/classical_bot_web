import test from 'node:test'
import assert from 'node:assert/strict'
import { cityQueryValues } from '../layers/concerts/shared/utils/city-query.js'
import { concertMapLocation, mapListLocation, normalizeMapQuery } from '../layers/concerts/app/utils/concert-discovery.js'

test('readable identities account for same-country English and local aliases across the full catalogue', () => {
  const values = cityQueryValues([
    { id: 143, english_name: 'Amsterdam', local_name: 'Amsterdam', country_code: 'NL' },
    { id: 1, english_name: 'Frankfort', country_code: 'US' },
    { id: 2, english_name: 'Frankfort', country_code: 'US' },
    { id: 3, english_name: 'Different name', local_name: 'AMSTERDAM', country_code: 'NL' },
    { id: 4, english_name: 'Amsterdam', country_code: 'US' },
    { id: 5, english_name: 'Vienna', local_name: 'Wien', country_code: 'AT' },
  ])
  assert.equal(values.get('143'), '143', 'even an alias without coordinates can make the name ambiguous')
  assert.equal(values.get('1'), '1')
  assert.equal(values.get('2'), '2')
  assert.equal(values.get('4'), 'Amsterdam,US')
  assert.equal(values.get('5'), 'Vienna,AT')
})

test('list/map round trip retains readable city, radius and complete date/music context', () => {
  const query = { city: 'Amsterdam,NL', radius: '50', datePreset: 'week', dateFrom: '2026-09-18', dateTo: '2026-09-20', composers: 'Bach', works: '12' }
  const map = concertMapLocation({ ...query, page: '3' }, query.city)
  assert.deepEqual(map, { path: '/map', query })
  assert.deepEqual(mapListLocation({ ...map.query, bounds: '4,52,6,53', page: '2' }), { path: '/', query })
  assert.deepEqual(mapListLocation({ bounds: '4,52,6,53', datePreset: 'week' }), { path: '/', query: { bounds: '4,52,6,53', datePreset: 'week' } })
})

test('legacy normalization preserves identity and radius, and is idempotent', () => {
  const query = { mapCity: '973', cityName: 'Frankfort,US', bounds: '1,2,3,4', page: '3' }
  const normalized = normalizeMapQuery(query)
  assert.deepEqual(normalized, { city: '973', bounds: '1,2,3,4', page: '3' })
  assert.deepEqual(normalizeMapQuery(normalized), normalized)
  assert.equal(normalizeMapQuery({ ...query, city: 'Amsterdam,NL' }).city, 'Amsterdam,NL')
  assert.deepEqual(normalizeMapQuery({ nearCity: '143', radiusKm: '50' }), { city: '143', radius: '50' })
  const point = { nearLat: '52', nearLng: '5', radiusKm: '50' }
  assert.deepEqual(mapListLocation(normalizeMapQuery(point)).query, point)
})
