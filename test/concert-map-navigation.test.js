import test from 'node:test'
import * as discovery from '../layers/concerts/app/utils/concert-discovery.js'
import assert from 'node:assert/strict'
import * as Vue from 'vue'
import { renderer } from '../test-support/vue.js'
import { useConcertQuery } from '../layers/concerts/app/composables/useConcertQuery.js'
import { useConcertMapNavigation } from '../layers/concerts/app/composables/useConcertMapNavigation.js'
import { parseConcertFilters } from '../layers/concerts/server/utils/concert-filters.js'

globalThis.createError = fields => Object.assign(new Error(fields.statusMessage), fields)
function mount(_path, _props, route = Vue.reactive({ query: {} }), fetcher = async () => ({ items: [] })) {
  let state
  const calls = []
  const app = renderer.createApp({ setup() {
    const router = Object.fromEntries(['push', 'replace'].map(method => [method, location => {
      calls.push({ method, location }); route.query = location.query
    }]))
    const mapData = Vue.ref({ items: [] })
    state = { ...useConcertMapNavigation(useConcertQuery(route, router), mapData, origin => fetcher('/api/get-area-cities', { params: { origin } })), mapData }
    return () => null
  } })
  app.mount({ children: [] })
  return { state, calls, ready: Vue.nextTick(), unmount: () => app.unmount() }
}

 test('map origin lookup resolves names and preserves saved viewport during delayed label lookup', async () => {
  for (const saved of [false, true]) {
    const query = saved ? { city: '25', bounds: '10,40,20,50', page: '3' } : { city: 'vIeNnA', radius: '100' }
    const route = Vue.reactive({ query: { ...query } })
    let respond
    const view = await mount('../layers/concerts/app/pages/map.vue', {}, route, async (_url, { params }) => {
      assert.deepEqual(params, { origin: saved ? '25' : 'vIeNnA' })
      return new Promise(resolve => { respond = resolve })
    })
    try {
      assert.equal(view.state.focus.value, null)
      view.state.moveMap('-170,-70,170,70', { restoring: true })
      respond({ items: [{ value: '25', label: 'Vienna', latitude: 48.2, longitude: 16.37 }] })
      await view.ready
      await Vue.nextTick()
      assert.equal(view.state.selectedName.value, 'Vienna')
      if (saved) {
        assert.equal(view.state.focus.value, null, 'label resolution must not trigger Leaflet recentering')
        assert.deepEqual(route.query, discovery.normalizeMapQuery(query), 'saved bounds and pagination remain unchanged')
      } else {
        assert.equal(view.state.focus.value.id, '25')
        assert.equal(route.query.city, 'vIeNnA')
        assert.equal(route.query.bounds, undefined, 'initial world bounds must not undo the city focus')
        await new Promise(resolve => setTimeout(resolve, 350))
        assert.equal(route.query.bounds, undefined, 'discard the pending initial viewport update too')
        view.state.moveMap('16,48,17,49')
        await new Promise(resolve => setTimeout(resolve, 350))
        assert.equal(route.query.bounds, '16,48,17,49', 'save the focused viewport')
      }
    } finally { view.unmount() }
  }
})

test('map links preserve numeric IDs and generate readable city filters for unambiguous selections', async () => {
  const route = Vue.reactive({ query: { city: '2', composers: 'Bach', dateFrom: '2026-10-01' } })
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route, async () => ({ items: [
    { value: '2', label: 'Bratislava', englishName: 'Bratislava', country_code: 'SK' },
  ] }))
  try {
    await view.ready
    assert.deepEqual(view.state.listLocation.value.query, { city: '2', composers: 'Bach', dateFrom: '2026-10-01' })
    view.state.mapData.value.items = [{ id: '25', name: 'Wien', englishName: 'Vienna', country: 'AT', cityQuery: 'Vienna,AT' }]
    view.state.selectCity(view.state.mapData.value.items[0])
    assert.equal(view.state.listLocation.value.query.city, 'Vienna,AT')
    assert.equal(route.query.city, 'Vienna,AT')
    assert.equal(parseConcertFilters(view.state.listLocation.value.query).city.name, 'Vienna')
    assert.equal(view.state.selectedCity.value, '25')
    view.state.jump({ value: '1', label: 'Praha', englishName: 'Prague', country_code: 'CZ', cityQuery: 'Prague,CZ' })
    assert.equal(view.state.listLocation.value.query.city, 'Prague,CZ')
    assert.equal(route.query.city, 'Prague,CZ')
    assert.equal(view.state.listParams.value.city, 'Prague,CZ')
    route.query = { bounds: '10,40,20,50' }
    assert.deepEqual(view.state.listLocation.value.query, { bounds: '10,40,20,50' })
  } finally { view.unmount() }
})

 test('readable map URLs resolve IDs on reload and history navigation without changing saved state', async () => {
  const saved = { city: 'Bratislava,SK', bounds: '10,40,20,50', page: '3', works: '12' }
  const route = Vue.reactive({ query: { ...saved } })
  const cities = {
    'Bratislava,SK': { value: '2', label: 'Bratislava', englishName: 'Bratislava', country_code: 'SK' },
    'Vienna,AT': { value: '25', label: 'Vienna', englishName: 'Vienna', country_code: 'AT' },
  }
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route, async (_url, { params }) => ({ items: [cities[params.origin]] }))
  try {
    await Vue.nextTick()
    assert.equal(view.state.selectedCity.value, '2')
    assert.equal(view.state.listParams.value.city, 'Bratislava,SK')
    assert.deepEqual(route.query, saved)
    assert.equal(view.state.focus.value, null)
    route.query = { ...saved, city: 'Vienna,AT' }
    await Vue.nextTick()
    await Vue.nextTick()
    assert.equal(view.state.selectedCity.value, '25')
    assert.equal(view.state.selectedName.value, 'Vienna')
    view.state.setPage(4)
    assert.equal(route.query.city, 'Vienna,AT')
    assert.equal(route.query.bounds, saved.bounds)
    assert.equal(route.query.works, '12')
    assert.equal(route.query.page, '4')
    route.query = { ...saved }
    await Vue.nextTick()
    await Vue.nextTick()
    assert.equal(view.state.selectedCity.value, '2')
    assert.equal(view.state.focus.value, null)
  } finally { view.unmount() }
})

test('Leaflet restoration bounds preserve pagination; only area browsing resets it', async () => {
  const saved = { city: '25', bounds: '10,40,20,50', page: '3' }
  const route = Vue.reactive({ query: { ...saved } })
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route)
  const settle = () => new Promise(resolve => setTimeout(resolve, 350))
  try {
    await view.ready
    view.state.moveMap('9,39,21,51', { restoring: true })
    await settle()
    assert.deepEqual(route.query, discovery.normalizeMapQuery(saved), 'initial fitBounds must not rewrite the saved query')
    view.state.moveMap('8,38,22,52')
    await settle()
    assert.equal(route.query.page, '3', 'selected-city results do not depend on viewport')
    view.state.moveMap('7,37,23,53')
    route.query = { bounds: '0,0,10,10', page: '4' } // Back/forward before the debounce finishes.
    view.state.moveMap('-1,-1,11,11', { restoring: true })
    await settle()
    assert.deepEqual(route.query, { bounds: '0,0,10,10', page: '4' })
    view.state.moveMap('-2,-2,12,12')
    await settle()
    assert.equal(route.query.page, undefined, 'user movement changes area results')
  } finally { view.unmount() }
})

test('Amsterdam round trip preserves name-based programme results, radius and dates after resolution and panning', async () => {
  const original = { city: 'Amsterdam,NL', radius: '50', datePreset: 'week', dateFrom: '2026-09-18', dateTo: '2026-09-20', composers: 'Bach' }
  const route = Vue.reactive({ query: discovery.concertMapLocation(original, original.city).query })
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route, async () => ({ items: [
    { value: '143', label: 'Amsterdam', cityQuery: 'Amsterdam,NL' },
  ] }))
  try {
    await Vue.nextTick()
    await Vue.nextTick()
    assert.equal(view.state.selectedCity.value, '143')
    assert.equal(view.state.listParams.value.city, 'Amsterdam,NL', 'resolving marker identity must not narrow the concert filter to an ID')
    assert.equal(view.state.listParams.value.radius, '50')
    view.state.moveMap('4,52,6,53')
    await new Promise(resolve => setTimeout(resolve, 350))
    assert.deepEqual(view.state.listLocation.value.query, original)
    assert.equal(view.state.listParams.value.bounds, undefined, 'viewport must not clip a selected city/radius')
    view.state.selectCity({ id: '25', name: 'Vienna', cityQuery: 'Vienna,AT' })
    assert.equal(route.query.radius, undefined, 'selecting a new marker starts an exact-city search')
    assert.equal(route.query.datePreset, 'week')
    view.state.clearCity()
    assert.equal(view.state.listLocation.value.query.bounds, '4,52,6,53')
    assert.equal(view.state.listLocation.value.query.city, undefined)
  } finally { view.unmount() }
})

test('ambiguous readable names stay broad when no single marker can be resolved', async () => {
  const route = Vue.reactive({ query: { city: 'Frankfort,US', bounds: '1,2,3,4' } })
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route)
  try {
    await Vue.nextTick()
    assert.equal(view.state.selectedCity.value, null)
    assert.equal(view.state.listParams.value.city, 'Frankfort,US')
    assert.equal(view.state.listLocation.value.query.city, 'Frankfort,US')
  } finally { view.unmount() }
})


test('origin lookups ignore obsolete responses and responses after unmount', async () => {
  const pending = []
  const route = Vue.reactive({ query: { city: 'Vienna,AT' } })
  const view = mount(null, null, route, () => new Promise(resolve => pending.push(resolve)))
  route.query = { city: 'Prague,CZ' }
  await Vue.nextTick()
  pending[0]({ items: [{ value: '1', label: 'Vienna' }] })
  await Vue.nextTick()
  assert.equal(view.state.selectedCity.value, null)
  view.unmount()
  pending[1]({ items: [{ value: '2', label: 'Prague' }] })
  await Vue.nextTick()
  assert.equal(view.state.focus.value, null)
})

test('explicit actions push, viewport updates replace, and unmount cancels debounce', async () => {
  const route = Vue.reactive({ query: { bounds: '1,2,3,4', page: '3' } })
  const view = mount(null, null, route)
  view.state.moveMap('2,3,4,5')
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(view.calls.at(-1).method, 'replace')
  assert.equal(route.query.page, undefined)
  view.state.setFilter('composers', ['Bach'])
  assert.equal(view.calls.at(-1).method, 'push')
  const count = view.calls.length
  view.state.moveMap('3,4,5,6')
  view.unmount()
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(view.calls.length, count)
})

test('failed origin lookup keeps the public selection usable and clearable', async () => {
  const route = Vue.reactive({ query: { city: 'Unknown,SK', bounds: '1,2,3,4' } })
  const view = mount(null, null, route, async () => { throw new Error('Lookup unavailable') })
  try {
    await view.ready
    assert.equal(view.state.hasSelection.value, true)
    assert.equal(view.state.listParams.value.city, 'Unknown,SK')
    assert.equal(view.state.selectedCity.value, null)
    view.state.clearCity()
    assert.equal(view.state.listParams.value.bounds, '1,2,3,4')
    assert.equal(view.state.listParams.value.city, undefined)
  } finally { view.unmount() }
})
