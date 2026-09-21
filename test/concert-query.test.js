import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive } from 'vue'
import { normalizeConcertQuery, serializeConcertQuery, updateConcertQuery, querySelections } from '../layers/concerts/shared/utils/concert-query.js'
import { useConcertQuery } from '../layers/concerts/app/composables/useConcertQuery.js'
import { parseConcertFilters } from '../layers/concerts/server/utils/concert-filters.js'

globalThis.createError = details => Object.assign(new Error(details.statusMessage), details)
globalThis.defineNuxtRouteMiddleware = handler => handler
globalThis.navigateTo = (location, options) => ({ location, options })
const middleware = (await import('../layers/concerts/app/middleware/area-search.global.js')).default

test('current query normalization trims selections without changing city identity or mutating input', () => {
  const input = { city: ['Vienna,AT', 'Prague,CZ'], composers: [' Bach, Mozart, Bach, ', 'Other'], works: '1, 2,1' }
  const original = structuredClone(input)
  const expected = { city: 'Vienna,AT', composers: 'Bach,Mozart', works: '1,2' }
  assert.deepEqual(normalizeConcertQuery(input), expected)
  assert.deepEqual(normalizeConcertQuery(expected), expected)
  assert.deepEqual(input, original)
})

test('serialization omits defaults and empty selections, preserves unrelated values, and is idempotent', () => {
  const input = { city: 'Vienna,AT', radius: '0', page: '1', composers: ' , ', works: '', utm_source: ['a', 'b'], datePreset: null }
  const expected = { city: 'Vienna,AT', utm_source: ['a', 'b'] }
  assert.deepEqual(serializeConcertQuery(input), expected)
  assert.deepEqual(serializeConcertQuery(expected), expected)
  assert.deepEqual(querySelections(' Bach, Mozart, Bach, '), ['Bach', 'Mozart'])
  assert.equal(serializeConcertQuery({ nearLat: '0', nearLng: '0', radius: '0' }).radius, '0')
  for (const query of [{ nearLat: '0', nearLng: '0', radius: '0' }, { city: '1', nearLat: '0', nearLng: '0', radius: '50' }, { city: '1', radius: '' }, { page: 'no', dateFrom: 'bad' }]) {
    assert.throws(() => parseConcertFilters(query), { statusCode: 400 })
  }
})

test('filter transitions preserve context, clear incompatible geography, and reset pagination', () => {
  const original = { city: 'Vienna,AT', radius: '50', bounds: '1,2,3,4', composers: 'Bach', dateFrom: '2026-10-01', datePreset: 'custom', page: '3' }
  assert.deepEqual(updateConcertQuery(original, { country: 'SK' }), { country: 'SK', composers: 'Bach', dateFrom: '2026-10-01', datePreset: 'custom' })
  assert.equal(updateConcertQuery(original, { city: 'Prague,CZ' }).radius, undefined)
  assert.equal(updateConcertQuery(original, { dateFrom: '2026-10-02' }).datePreset, undefined)
  assert.equal(updateConcertQuery(original, { works: ['1', '1', '2'] }).works, '1,2')
  assert.deepEqual(updateConcertQuery(original, { page: '4' }, { resetPage: false }), { ...original, page: '4' })
  assert.equal(updateConcertQuery(original, { city: 'Prague,CZ' }, { clearBounds: false }).bounds, original.bounds)
})

test('route composable follows history and chooses push versus replace without mirrored state', async () => {
  const route = reactive({ query: { composers: ' Bach, Bach ', page: '3' } })
  const calls = []
  const router = Object.fromEntries(['push', 'replace'].map(method => [method, async location => { calls.push([method, location]); route.query = location.query }]))
  const state = useConcertQuery(route, router)
  assert.equal(state.query.value.composers, 'Bach')
  await state.update({ works: ['1', '2'] })
  assert.equal(calls[0][0], 'push')
  assert.equal(state.query.value.page, undefined)
  await state.update({ bounds: '1,2,3,4' }, { replace: true, path: '/map' })
  assert.equal(calls[1][0], 'replace')
  route.query = { city: 'Vienna,AT', radius: '50' }
  assert.equal(state.query.value.city, 'Vienna,AT')
})

test('page middleware replaces canonical URLs once, preserves hashes, and leaves fixed routes when expanding', () => {
  const input = { path: '/map', query: { city: '123', radius: '50', page: '1', utm_source: 'test' }, hash: '#programme' }
  const result = middleware(input)
  assert.deepEqual(result, { location: { path: '/map', query: { city: '123', radius: '50', utm_source: 'test' }, hash: '#programme' }, options: { replace: true } })
  assert.equal(middleware(result.location), undefined)
  assert.deepEqual(middleware({ path: '/austria/vienna', query: { city: 'Vienna,AT', radius: '50', composers: 'Bach' }, hash: '#results' }).location,
    { path: '/', query: { city: 'Vienna,AT', radius: '50', composers: 'Bach' }, hash: '#results' })
})

test('radius-only fixed-city links retain their route origin, pagination, filters and hash', () => {
  for (const path of ['/austria/vienna', '/Bratislava']) {
    const query = { radius: '50', page: '2', composers: 'Bach', dateFrom: '2026-10-01' }
    const location = { path, query, hash: '#programme' }
    assert.equal(middleware(location), undefined)
  }
})
