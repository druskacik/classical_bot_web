import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyConcertLocation } from '../shared/utils/legacy-concert-location.js'

const catalogue = { byId: new Map([['1', { countryCode: 'CZ', path: '/czechia/prague' }]]) }

test('equivalent country and explicitly country-scoped city IDs retain every other parameter', () => {
  const filters = { page: '2', composers: 'Claude Debussy', works: '12', dateFrom: '2026-10-01', utm_source: 'email', unknown: ['a', 'b'] }
  assert.deepEqual(legacyConcertLocation({ country: ' cz ', ...filters }), { path: '/czechia', query: filters })
  assert.deepEqual(legacyConcertLocation({ country: 'CZ', city: '1', ...filters }, catalogue), { path: '/czechia/prague', query: filters })
})

test('ambiguous, conflicting, named, and area-based locations are never redirected', () => {
  for (const query of [
    {}, { country: ['CZ', 'DE'] }, { country: 'invalid' }, { city: '1' },
    { country: 'DE', city: '1' }, { country: 'CZ', city: '999' },
    { country: 'CZ', city: 'Prague,CZ' }, { country: 'CZ', city: 'Prague' },
    { country: 'CZ', city: ['1', '2'] }, { country: 'CZ', radius: '25' },
    { country: 'CZ', nearLat: '50', nearLng: '14' }, { country: 'CZ', bounds: '1,2,3,4' },
  ]) assert.equal(legacyConcertLocation(query, catalogue), null)
})
