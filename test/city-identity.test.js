import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCityIdentities, resolveCitySelection } from '../layers/concerts/shared/utils/city-identity.js'

test('identity resolution uses country-qualified exact aliases across the full catalogue', () => {
  const cities = [
    { id: 1, english_name: 'Prague', local_name: 'Praha', country_code: 'CZ' },
    { id: 2, english_name: 'Prague', country_code: 'US' },
    { id: 3, english_name: 'Town A', local_name: 'Shared', country_code: 'CZ' },
    { id: 4, english_name: 'Town B', local_name: 'SHARED', country_code: 'CZ' },
    { id: 5, english_name: 'Å', local_name: 'Å', country_code: 'NO' },
  ]
  const identities = buildCityIdentities(cities)
  assert.equal(identities.resolve({ name: 'PRAHA', country: 'cz' }).id, 1)
  assert.equal(identities.resolve({ name: 'Prague' }), null)
  assert.equal(identities.resolve({ name: 'Shared', country: 'CZ' }), null)
  assert.equal(identities.resolve({ name: 'A', country: 'NO' }), null)
  assert.deepEqual(identities.uniqueAliases(cities[2]), ['town a'])
  assert.deepEqual(identities.uniqueAliases(cities[4]), ['å'])
  assert.deepEqual(resolveCitySelection({ id: 1 }, identities), {
    id: 1, canonicalId: '1', countryCode: 'CZ', aliases: ['prague', 'praha'],
  })
  const unresolved = { name: 'Unknown', country: 'CZ' }
  assert.equal(resolveCitySelection(unresolved, identities), unresolved)
})
