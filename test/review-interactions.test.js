import { useConcertMapNavigation } from '../layers/concerts/app/composables/useConcertMapNavigation.js'
import { useConcertDateFilter } from '../layers/concerts/app/composables/useConcertDateFilter.js'
import { compileComponent, renderer } from '../test-support/vue.js'
import * as queryHelpers from '../layers/concerts/shared/utils/concert-query.js'
import { useConcertQuery } from '../layers/concerts/app/composables/useConcertQuery.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as Vue from 'vue'
import { createConcertText } from '../layers/concerts/app/utils/concert-text.js'
import * as discovery from '../layers/concerts/app/utils/concert-discovery.js'
import * as area from '../layers/concerts/shared/utils/concert-area.js'
import * as map from '../layers/concerts/shared/utils/concert-map.js'
import * as dates from '../layers/concerts/app/utils/concert-dates.js'
import { parseConcertFilters } from '../layers/concerts/server/utils/concert-filters.js'
import { parseArea } from '../layers/concerts/server/utils/concert-area.js'

globalThis.createError = fields => Object.assign(new Error(fields.statusMessage), fields)
async function mount(path, props, route = Vue.reactive({ query: {} }), fetcher = async () => ({ items: [] })) {
  const mounted = []
  const dataRequests = []
  // Each mount gets desktop media queries and its own listener lifecycle.
  const mediaQueries = new Map()
  const browserWindow = {
    matchMedia(query) {
      if (!mediaQueries.has(query)) {
        mediaQueries.set(query, Object.assign(new EventTarget(), { media: query, matches: false }))
      }
      return mediaQueries.get(query)
    },
  }
  const component = compileComponent(path, {
    ...discovery, ...area, ...map, ...dates, ...queryHelpers, useConcertQuery, useConcertMapNavigation, useConcertDateFilter,
    onMounted: callback => mounted.push(callback), window: browserWindow, $fetch: fetcher,
    useRoute: () => route,
    useRouter: () => ({ push: location => { route.query = location.query }, replace: location => { route.query = location.query } }),
    definePageMeta() {}, useConcertListSeo() {},
    useCountries: () => Promise.resolve({ data: Vue.ref([]) }),
    useAsyncData: (key, handler) => {
      dataRequests.push({ key, handler })
      return { data: Vue.ref({ items: [] }), status: Vue.ref('success'), error: Vue.ref(null), refresh() {} }
    },
  })
  let result
  const app = renderer.createApp({ setup() { result = component.setup(props, { emit() {}, expose() {} }); return () => null } })
  app.mount({ children: [] })
  const state = await result
  const ready = Promise.all(mounted.map(callback => callback()))
  return { state, ready, dataRequests, unmount: () => app.unmount() }
}

test('music autocomplete retains coordinate and city areas with the canonical radius format', async () => {
  const props = Vue.reactive({ areaQuery: { nearLat: '48.15', nearLng: '17.11', radius: '100' }, radius: 100, city: null, composers: ['1'], works: ['2'], dateFrom: '2026-10-01' })
  const view = await mount('../layers/concerts/app/components/concert-filters.vue', props)
  try {
    assert.deepEqual(parseArea(view.state.optionContext.value), { latitude: 48.15, longitude: 17.11, radiusKm: 100 })
    assert.equal(view.state.optionContext.value.composers, '1')
    assert.equal(view.state.optionContext.value.works, '2')
    assert.equal(view.state.optionContext.value.dateFrom, '2026-10-01')
    assert.equal(parseArea(view.state.cityContext.value), null, 'city replacement must not remain restricted to the old area')
    props.areaQuery = {}
    props.city = '2' // Resolved API metadata may also supply the city.
    assert.deepEqual(parseArea(view.state.optionContext.value), { origin: '2', radiusKm: 100 })
    props.radius = 0
    assert.equal(parseArea(view.state.optionContext.value), null)
    assert.equal(view.state.optionContext.value.city, '2')
  } finally { view.unmount() }
})

test('map pagination resets only its programme scrollport, including route history changes', async () => {
  const route = Vue.reactive({ query: {} })
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route)
  try {
    view.state.programmePanel.value = { scrollTop: 1500 }
    view.state.setPage(2)
    await Vue.nextTick()
    assert.equal(view.state.programmePanel.value.scrollTop, 0)
    view.state.programmePanel.value.scrollTop = 800
    route.query = {} // Browser back to page 1.
    await Vue.nextTick()
    assert.equal(view.state.programmePanel.value.scrollTop, 0)
    view.state.programmePanel.value.scrollTop = 300
    route.query = { composers: '1' }
    await Vue.nextTick()
    assert.equal(view.state.programmePanel.value.scrollTop, 300, 'same-page updates must not continually reset the panel')
  } finally { view.unmount() }
})

test('map component marks initialization, history fitBounds and resize events as restoration', async () => {
  const events = []
  const handlers = {}
  let resizeCallback
  let viewport = { west: 9, south: 39, east: 21, north: 51 }
  const leafletMap = {
    setView() {}, fitBounds() { handlers.moveend?.() },
    getBounds: () => ({ getWest: () => viewport.west, getSouth: () => viewport.south, getEast: () => viewport.east, getNorth: () => viewport.north }),
    getSize: () => ({ x: 100, y: 100 }), getZoom: () => 5,
    on: (name, fn) => { handlers[name] = fn },
    invalidateSize: () => handlers.moveend?.(), remove() {},
  }
  const markerLayers = new Set()
  const layer = {
    addTo() { return this }, on() {},
    addLayer(marker) { markerLayers.add(marker); return this },
    clearLayers() { markerLayers.clear() },
    eachLayer(callback) { markerLayers.forEach(callback) },
  }
  const leaflet = { map: () => leafletMap, control: { zoom: () => layer, scale: () => layer }, layerGroup: () => layer, tileLayer: () => layer }
  const component = compileComponent('../layers/concerts/app/components/concert-map.client.vue', {
    ...map,
    ResizeObserver: class { constructor(callback) { resizeCallback = callback } observe() {} disconnect() {} },
  }, { modules: { leaflet: { default: leaflet }, 'leaflet/dist/leaflet.css': {} } })
  const props = Vue.reactive({ cities: [], bounds: '10,40,20,50', selected: null, focus: null, obscuredHeight: 0 })
  const app = renderer.createApp({ setup() { component.setup(props, { emit: (...args) => events.push(args), expose() {} }); return () => null } })
  app.mount({ children: [] })
  try {
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(events.at(-1), ['bounds', '9,39,21,51', { restoring: true }])
    props.bounds = '0,0,10,10'
    viewport = { west: -1, south: -1, east: 11, north: 11 }
    await Vue.nextTick()
    assert.deepEqual(events.at(-1), ['bounds', '-1,-1,11,11', { restoring: true }])
    resizeCallback()
    assert.equal(events.at(-1)[2].restoring, true)
    handlers.moveend()
    assert.equal(events.at(-1)[2].restoring, false, 'normal pan/zoom is user movement')
    const previousCount = events.length
    props.bounds = null
    await Vue.nextTick()
    assert.equal(events.length, previousCount + 1, 'returning to bare /map republishes the current viewport')
    assert.deepEqual(events.at(-1), ['bounds', '-1,-1,11,11', { restoring: true }])
    const route = Vue.reactive({ query: { bounds: '0,0,10,10' } })
    const page = await mount('../layers/concerts/app/pages/map.vue', {}, route)
    try {
      route.query = {}
      await Vue.nextTick()
      assert.equal(page.state.listLoading.value, true)
      page.state.moveMap(...events.at(-1).slice(1))
      await new Promise(resolve => setTimeout(resolve, 350))
      assert.equal(page.state.listParams.value.bounds, '-1,-1,11,11')
      assert.equal(page.state.listLoading.value, false, 'the programme is no longer waiting for bounds')
    } finally { page.unmount() }
  } finally { app.unmount() }
  const disposedCount = events.length
  assert.doesNotThrow(() => handlers.moveend())
  assert.equal(events.length, disposedCount, 'late Leaflet events must not publish after disposal')
})

 test('bare map waits for Leaflet bounds before fetching the programme', async () => {
  const requests = []
  const route = Vue.reactive({ query: {} })
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route, async (url, { params }) => {
    requests.push({ url, params })
    return { items: [], total: 0, totalPages: 0 }
  })
  try {
    const programme = view.dataRequests[1]
    await programme.handler()
    assert.deepEqual(requests, [], 'no worldwide placeholder request on SSR or client navigation')
    assert.equal(view.state.listLoading.value, true, 'waiting must not show an empty-results message')
    view.state.moveMap('10,40,20,50', { restoring: true })
    await new Promise(resolve => setTimeout(resolve, 350))
    await programme.handler()
    assert.deepEqual(requests, [{ url: '/api/get-concerts', params: { bounds: '10,40,20,50', page: 1 } }])
    assert.equal(view.state.listLoading.value, false)
    for (const query of [{ bounds: '0,0,10,10' }, { city: '25' }, { city: 'Vienna,AT' }]) {
      route.query = query
      assert.ok(view.state.listParams.value, 'saved bounds and city links can fetch immediately')
    }
  } finally { view.unmount() }
})

 test('viewport list music facets retain bounds alongside dates and other music filters', async () => {
  const props = Vue.reactive({ bounds: '10,40,20,50', areaQuery: {}, radius: 0, composers: ['Bach'], works: ['12'], dateFrom: '2026-10-01' })
  const view = await mount('../layers/concerts/app/components/concert-filters.vue', props)
  try {
    for (const type of ['composer', 'work']) {
      const params = { ...view.state.optionContext.value, type }
      assert.deepEqual(parseConcertFilters(params).bounds, { west: 10, south: 40, east: 20, north: 50 })
      assert.equal(params.composers, 'Bach')
      assert.equal(params.works, '12')
      assert.equal(params.dateFrom, '2026-10-01')
    }
    props.bounds = null
    assert.equal(view.state.optionContext.value.bounds, undefined)
  } finally { view.unmount() }
})

test('same-name cities retain distinct identity in generated map and list links', async () => {
  const route = Vue.reactive({ query: {} })
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route)
  try {
    for (const id of ['100', '101']) {
      view.state.selectCity({ id, name: 'Springfield', englishName: 'Springfield', country: 'US' })
      assert.equal(route.query.city, id)
      assert.equal(parseConcertFilters(view.state.listLocation.value.query).city.id, Number(id))
    }
    view.state.clearCity()
  } finally { view.unmount() }
})

test('coordinate and unresolved city selections can be cleared back to the latest viewport', async () => {
  for (const selection of [{ nearLat: '52.37', nearLng: '4.9', radius: '50' }, { city: 'Frankfort,US' }]) {
    const context = { dateFrom: '2026-10-01', datePreset: 'custom', composers: 'Bach', works: '12' }
    const route = Vue.reactive({ query: { ...selection, ...context, bounds: '4,52,6,53', page: '3' } })
    const view = await mount('../layers/concerts/app/pages/map.vue', {}, route)
    try {
      await Vue.nextTick()
      assert.equal(view.state.selectedCity.value, null)
      assert.equal(view.state.hasSelection.value, true, 'clear control must not depend on a resolved marker')
      assert.equal(view.state.selectionTitle.value, selection.city || 'Selected area (50 km radius)')
      view.state.moveMap('5,51,7,54')
      assert.equal(view.state.listParams.value.bounds, undefined, 'panning retains the fixed selection until cleared')
      view.state.clearCity() // Clear before the viewport debounce finishes.
      await Vue.nextTick()
      assert.deepEqual(route.query, { ...context, bounds: '5,51,7,54' })
      assert.equal(view.state.hasSelection.value, false)
      assert.equal(view.state.selectionTitle.value, null)
      assert.deepEqual(view.state.listParams.value, { dateFrom: context.dateFrom, composers: 'Bach', works: '12', bounds: '5,51,7,54', page: 1 })
      view.state.moveMap('6,50,8,55')
      await new Promise(resolve => setTimeout(resolve, 350))
      assert.equal(view.state.listParams.value.bounds, '6,50,8,55', 'programme follows viewport again')
    } finally { view.unmount() }
  }
  assert.equal(createConcertText('sk-SK').t('Selected area ({radius} km radius)', { radius: 50 }), 'Vybraná oblasť (okruh 50 km)')
})

test('fixed-city radius requests use the page origin and omit the exact-country constraint', async () => {
  for (const cityPage of [{ id: '25', countryCode: 'AT', path: '/austria/vienna' }, { id: '2', countryCode: 'SK', path: '/Bratislava' }]) {
    const route = Vue.reactive({ path: cityPage.path, query: { radius: '50', page: '2', composers: 'Bach' } })
    const requests = []
    assert.equal(discovery.normalizeAreaLocation(route.path, route.query), null)
    const view = await mount('../layers/concerts/app/components/concert-list-page.vue', { title: 'City concerts', countryCode: cityPage.countryCode, cityPage }, route, async (url, { params }) => { requests.push({ url, params }); return { items: [] } })
    try {
      await view.dataRequests[0].handler()
      assert.deepEqual(requests, [{ url: '/api/get-concerts', params: {
        radius: '50', bounds: undefined, country: undefined, city: cityPage.id,
        dateFrom: undefined, dateTo: undefined, composers: 'Bach', works: undefined, page: 2,
      } }])
      assert.deepEqual(parseConcertFilters(requests[0].params, cityPage.countryCode === 'SK' ? 'SK' : null).area, { origin: cityPage.id, radiusKm: 50 })
    } finally { view.unmount() }
  }
})
