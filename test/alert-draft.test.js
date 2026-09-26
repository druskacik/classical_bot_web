import test from 'node:test'
import assert from 'node:assert/strict'
import { alertDraft, updateAlertDraft, alertCityRadius } from '../app/utils/alert-draft.js'

test('alert drafts detach from browsing criteria, retain fixed dates, and omit pagination', () => {
  const criteria = { country: 'SK', city: 12, composers: ['Bach'], dateFrom: '2026-10-01', dateTo: '2026-10-07', page: 3 }
  const draft = alertDraft(criteria)
  assert.deepEqual(draft, { country: 'SK', city: '12', composers: 'Bach', dateFrom: '2026-10-01', dateTo: '2026-10-07' })
  const changed = updateAlertDraft(draft, { country: 'AT' })
  assert.equal(changed.city, undefined)
  assert.equal(criteria.city, 12)
  assert.equal(draft.city, '12')
})

test('legacy saved radius criteria are editable in the shared controls', () => {
  assert.deepEqual(alertDraft({ nearCity: '12', radiusKm: '50' }), { city: '12', radius: '50' })
})

test('radius changes clear incompatible country and coordinate state', () => {
  assert.deepEqual(alertCityRadius({ country: 'SK', nearLat: '48', nearLng: '17', composers: 'Bach' }, { city: '12', radius: 50 }), { city: '12', radius: '50', composers: 'Bach' })
  assert.deepEqual(alertCityRadius({ city: '12', radius: '50' }, { city: null, radius: 0 }), {})
})

test('worldwide empty criteria and date preset clearing follow existing query semantics', () => {
  assert.deepEqual(alertDraft(), {})
  assert.deepEqual(updateAlertDraft({ datePreset: 'week', dateFrom: '2026-10-01' }, { dateFrom: '2026-10-02' }), { dateFrom: '2026-10-02' })
})

test('alert drafts require an actual filter rather than navigation or empty selections', async () => {
  const { hasAlertFilter } = await import('../app/utils/alert-draft.js')
  for (const draft of [{}, { country: '', city: ' ' }, { composers: ' , ', works: ',' }, { radius: '50' }, { page: '2', datePreset: 'any' }]) {
    assert.equal(hasAlertFilter(draft), false)
  }
  for (const draft of [{ country: 'AT' }, { city: '12' }, { composers: 'Bach' }, { works: '1' }, { dateFrom: '2026-10-01' }, { dateTo: '2026-10-07' }, { nearLat: '48', nearLng: '17', radius: '50' }]) {
    assert.equal(hasAlertFilter(draft), true)
  }
})
