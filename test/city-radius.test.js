import { compileComponent, renderer } from '../test-support/vue.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as Vue from 'vue'
import { cityRadiusLocation } from '../layers/concerts/app/utils/concert-discovery.js'
import { parseConcertFilters, applyFilters } from '../layers/concerts/server/utils/concert-filters.js'
import { resolveArea } from '../layers/concerts/server/utils/concert-area.js'
import knex from 'knex'
globalThis.createError = fields => Object.assign(new Error(fields.statusMessage), fields)
function mount(props) {
  const emitted = []
  const component = compileComponent('../layers/concerts/app/components/city-radius.vue')
  let state
  const app = renderer.createApp({ setup() { state = component.setup(props, { emit: (...args) => emitted.push(args), expose() {} }); return () => null } })
  app.mount({ children: [] })
  return { state, emitted, unmount: () => app.unmount() }
}
test('inline radius defaults to city only; custom edits require an explicit valid submission', async () => {
  const view = mount({ city: '2', radius: 0 })
  assert.equal(view.state.custom.value, false)
  await view.state.choose('100')
  assert.deepEqual(view.emitted.pop(), ['change', { city: '2', radius: 100 }])
  await view.state.choose('custom')
  assert.equal(view.emitted.length, 0)
  for (const value of ['', '-1', '501', '1.5', 'bad']) { view.state.draft.value = value; view.state.apply() }
  assert.equal(view.emitted.length, 0)
  view.state.draft.value = '75'
  view.state.apply()
  assert.deepEqual(view.emitted.pop(), ['change', { city: '2', radius: 75 }])
  assert.equal(view.state.custom.value, false, 'saved values return to the radius pill')
  await view.state.choose('custom')
  view.state.draft.value = '42'
  view.state.cancel()
  assert.equal(view.state.custom.value, false)
  assert.equal(view.emitted.length, 0, 'Escape discards the unsubmitted value')
  await view.state.choose('0')
  assert.deepEqual(view.emitted.pop(), ['change', { city: '2', radius: 0 }])
  view.state.changeCity([])
  assert.deepEqual(view.emitted.pop(), ['change', { city: null, radius: 0 }])
  view.unmount()
})
test('city/radius navigation removes fixed geography and page while preserving date and music', () => {
  const query = { country: 'SK', city: '2', page: '3', works: '1', dateFrom: '2026-10-01', bounds: '0,0,10,10' }
  const location = cityRadiusLocation(query, '2', 75)
  assert.deepEqual(location, { path: '/', query: { city: '2', radius: '75', works: '1', dateFrom: '2026-10-01' } })
  assert.equal(cityRadiusLocation(location.query, '2', 0).query.radius, undefined)
  assert.equal(cityRadiusLocation(location.query, null, 100).query.radius, undefined)
})
test('zero radius means exact city; positive radius resolves numeric and readable cities across borders', () => {
  const cities = [
    { id: 2, english_name: 'Bratislava', local_name: 'Bratislava', country_code: 'SK', latitude: 48.14816, longitude: 17.10674 },
    { id: 25, english_name: 'Vienna', local_name: 'Wien', country_code: 'AT', latitude: 48.20849, longitude: 16.37208 },
  ]
  const exact = parseConcertFilters({ city: '2', radius: '0' })
  assert.equal(exact.area, undefined)
  assert.equal(exact.city.id, 2)
  for (const city of ['2', 'Bratislava,SK']) {
    const filters = parseConcertFilters({ city, radius: '100' }, 'SK')
    filters.area = resolveArea(filters.area, cities)
    assert.equal(filters.city, null)
    assert.deepEqual(filters.area.cityIds, ['2','25'])
    const sql = applyFilters(knex({ client: 'pg' })('classical_concert as cc'), filters).toSQL()
    assert.ok(sql.bindings.includes('SK'))
    assert.ok(sql.bindings.includes('25'))
  }
  for (const query of [{ radius: '100' }, { city: '2', radius: '-1' }, { city: '2', radius: '501' }, { city: '2', radius: '1.5' }]) assert.throws(() => parseConcertFilters(query), { statusCode: 400 })
})

test('choosing a new city starts an exact-city search even when the previous city had a radius', () => {
  const view = mount({ city: '2', radius: 100 })
  view.state.changeCity(['25'])
  assert.deepEqual(view.emitted.pop(), ['change', { city: '25', radius: 0 }])
  view.unmount()
})
