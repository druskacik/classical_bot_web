import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleFilterOptions } from '../layers/concerts/server/utils/filter-options/response.js'

const request = (type, changes = {}) => ({ type, context: { country: null }, includeUnavailable: false, ...changes })

test('facet responses normalize database values and restore selections without reordering ranked suggestions', () => {
  const loaded = {
    suggestions: [
      { value: 2, label: 'Second by name, first by rank', count: '3', secondaryLabel: 'Composer' },
      { value: 1, label: 'Alphabetically first', count: '1', secondaryLabel: 'Other composer' },
      { value: 3, label: 'Unavailable', count: '0' },
    ],
    selectedOptions: [
      { value: 2, label: 'Do not replace the suggestion', count: 99 },
      { value: 4, label: 'Restored zero-count selection', count: 0 },
      { value: 5, label: 'Restored label without availability' },
    ],
  }
  assert.deepEqual(assembleFilterOptions(request('work'), loaded), { items: [
    { value: '2', label: 'Second by name, first by rank', count: 3, secondaryLabel: 'Composer' },
    { value: '1', label: 'Alphabetically first', count: 1, secondaryLabel: 'Other composer' },
    { value: '4', label: 'Restored zero-count selection', count: 0 },
    { value: '5', label: 'Restored label without availability', count: 0 },
  ] })
  assert.equal(assembleFilterOptions(request('work', { includeUnavailable: true }), loaded).items[2].value, '3')
  assert.equal(loaded.suggestions[0].count, '3', 'Response normalization does not mutate loader results')
  const fullPage = assembleFilterOptions(request('composer'), {
    suggestions: Array.from({ length: 20 }, (_, index) => ({ value: `Composer ${index}`, label: `Composer ${index}`, count: 1 })),
    selectedOptions: [{ value: 'Selected outside the limit', label: 'Selected outside the limit', count: 0 }],
  })
  assert.equal(fullPage.items.length, 21, 'The suggestion limit does not discard restored selections')
  assert.equal(fullPage.items[20].value, 'Selected outside the limit')
})

test('country facets sort restored labels, while cities retain country and radius metadata', () => {
  assert.deepEqual(assembleFilterOptions(request('country'), {
    suggestions: [{ value: 'SK', label: 'Slovakia', count: '2' }],
    selectedOptions: [{ value: 'AT', label: 'Austria' }],
  }), { items: [
    { value: 'AT', label: 'Austria', count: 0 },
    { value: 'SK', label: 'Slovakia', count: 2 },
  ] })
  const loaded = {
    suggestions: [{ value: 'Vienna,AT', label: 'Vienna', country_code: 'AT', count: '2', radiusAvailable: true }],
    selectedOptions: [],
  }
  assert.deepEqual(assembleFilterOptions(request('city'), loaded).items[0], {
    value: 'Vienna,AT', label: 'Vienna', country_code: 'AT', count: 2, radiusAvailable: true, secondaryLabel: 'Austria',
  })
  const scoped = assembleFilterOptions(request('city', { context: { country: 'AT' } }), loaded).items[0]
  assert.equal(Object.hasOwn(scoped, 'secondaryLabel'), false)
  assert.equal(scoped.radiusAvailable, true)
})
