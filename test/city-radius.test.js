import { serializeComposerSelections } from '../layers/concerts/shared/utils/concert-query.js'
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
  await view.state.choose('100', true)
  assert.deepEqual(view.emitted.pop(), ['change', { city: '2', radius: 100 }])
  await view.state.choose('custom', true)
  assert.equal(view.emitted.length, 0)
  for (const value of ['', '-1', '501', '1.5', 'bad']) { view.state.draft.value = value; view.state.apply(true) }
  assert.equal(view.emitted.length, 0)
  view.state.draft.value = '75'
  view.state.apply(true)
  assert.deepEqual(view.emitted.pop(), ['change', { city: '2', radius: 75 }])
  assert.equal(view.state.custom.value, false, 'saved values return to the radius pill')
  await view.state.choose('custom', true)
  view.state.draft.value = '42'
  view.state.cancel()
  assert.equal(view.state.custom.value, false)
  assert.equal(view.emitted.length, 0, 'Escape discards the unsubmitted value')
  await view.state.choose('0', true)
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


test('radius expansion requires current matching metadata and never reuses another city', async () => {
  const props = Vue.reactive({ city: '2', radius: 0 })
  const view = mount(props)
  try {
    const options = [{ value: '2', radiusAvailable: true }, { value: 'Unknown,SK', radiusAvailable: false }]
    assert.equal(view.state.available(options, false, false), true)
    for (const [loading, error] of [[true, false], [false, true]]) assert.equal(view.state.available(options, loading, error), false)
    props.city = 'Unknown,SK'
    assert.equal(view.state.available(options, false, false), false)
    assert.equal(view.state.available([], false, false), false)
    await view.state.choose('25', false)
    await view.state.choose('custom', false)
    view.state.draft.value = '25'
    view.state.apply(false)
    assert.deepEqual(view.emitted, [])
    view.state.changeCity(['Unknown,SK'])
    assert.deepEqual(view.emitted.pop(), ['change', { city: 'Unknown,SK', radius: 0 }])
  } finally { view.unmount() }
})

test('rendered radius follows autocomplete metadata across reload, failure and selection changes', async () => {
  const requests = []
  const autocomplete = compileComponent('../layers/concerts/app/components/filter-autocomplete.vue', {
    serializeComposerSelections,
    $fetch: (_url, { params }) => new Promise((resolve, reject) => requests.push({ params, resolve, reject })),
    document: { addEventListener() {}, removeEventListener() {}, getElementById() {} },
  }, { inlineTemplate: true })
  const radius = compileComponent('../layers/concerts/app/components/city-radius.vue', {}, { inlineTemplate: true })
  const props = Vue.reactive({ city: 'Nové Město nad Metují,CZ', radius: 0 })
  const root = { children: [] }
  const app = renderer.createApp({ render: () => Vue.h(radius, props) })
  app.component('FilterAutocomplete', autocomplete)
  app.component('UIcon', { render: () => null })
  const find = (node, tag) => node.tag === tag ? node : node.children?.map(child => find(child, tag)).find(Boolean)
  const flush = async () => { await Promise.resolve(); await Vue.nextTick(); await Vue.nextTick() }
  app.mount(root)
  try {
    assert.equal(find(root, 'select').props.disabled, true)
    requests.at(-1).resolve({ items: [{ value: props.city, label: 'Nové Město nad Metují', radiusAvailable: false }] })
    await flush()
    assert.equal(find(root, 'select').props.disabled, true)
    assert.ok(find(root, 'select').props['aria-describedby'])
    props.city = 'Prague,CZ'
    await flush()
    assert.equal(find(root, 'select').props.disabled, true)
    requests.at(-1).resolve({ items: [{ value: props.city, label: 'Prague', radiusAvailable: true }] })
    await flush()
    assert.equal(find(root, 'select').props.disabled, false)
    assert.equal(find(root, 'select').props['aria-describedby'], undefined)
    props.city = 'Unknown,CZ'
    await flush()
    requests.at(-1).reject(new Error('Unavailable'))
    await flush()
    assert.equal(find(root, 'select').props.disabled, true)
    props.city = null
    await flush()
    assert.equal(find(root, 'select').props.disabled, true)
  } finally { app.unmount() }
})
