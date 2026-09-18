import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import * as discovery from '../layers/concerts/app/utils/concert-discovery.js'
import * as area from '../layers/concerts/shared/utils/concert-area.js'
import * as map from '../layers/concerts/shared/utils/concert-map.js'
import { parseConcertFilters } from '../layers/concerts/server/utils/concert-filters.js'
import { parseArea } from '../layers/concerts/server/utils/concert-area.js'

globalThis.createError = fields => Object.assign(new Error(fields.statusMessage), fields)
const renderer = Vue.createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode() {}, nextSibling() {} })
async function mount(path, props, route = Vue.reactive({ query: {} }), fetcher = async () => ({ items: [] })) {
  const mounted = []
  const dataRequests = []
  const { descriptor } = parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  const executable = compileScript(descriptor, { id: 'review-test' }).content
    .replace(/import \{([^}]+)\} from ['"]([^'"]+)['"]/g, (_, names, source) =>
      `const { ${names.replace(/ as /g, ': ')} } = ${source === 'vue' ? 'Vue' : 'utilities'}`)
    .replace('export default', 'return')
  const component = new Function('Vue', 'utilities', 'route', '$fetch', 'mounted', 'dataRequests', `
    const { ref, computed, watch, useId, onBeforeUnmount } = Vue;
    const onMounted = callback => mounted.push(callback);
    const useConcertText = () => ({ t: text => text, locale: 'en-GB' });
    const useAppConfig = () => ({ concertSite: {} });
    const useRoute = () => route;
    const useRouter = () => ({ push: location => { route.query = location.query }, replace: location => { route.query = location.query } });
    const definePageMeta = () => {};
    const useConcertListSeo = () => {};
    const useAsyncData = (key, handler) => { dataRequests.push({ key, handler }); return { data: ref({ items: [] }), status: ref('success'), refresh() {} } };
    ${executable}
  `)(Vue, { ...discovery, ...area, ...map }, route, fetcher, mounted, dataRequests)
  let result
  const app = renderer.createApp({ setup() { result = component.setup(props, { emit() {}, expose() {} }); return () => null } })
  app.mount({})
  const state = await result
  const ready = Promise.all(mounted.map(callback => callback()))
  return { state, ready, dataRequests, unmount: () => app.unmount() }
}

test('music autocomplete retains coordinate and legacy city areas without mixing radius formats', async () => {
  const props = Vue.reactive({ areaQuery: { nearLat: '48.15', nearLng: '17.11', radiusKm: '100' }, radius: 100, city: null, composers: ['1'], works: ['2'], dateFrom: '2026-10-01' })
  const view = await mount('../layers/concerts/app/components/concert-filters.vue', props)
  try {
    assert.deepEqual(parseArea(view.state.optionContext.value), { latitude: 48.15, longitude: 17.11, radiusKm: 100 })
    assert.equal(view.state.optionContext.value.composers, '1')
    assert.equal(view.state.optionContext.value.works, '2')
    assert.equal(view.state.optionContext.value.dateFrom, '2026-10-01')
    assert.equal(parseArea(view.state.cityContext.value), null, 'city replacement must not remain restricted to the old area')
    props.areaQuery = { nearCity: '2', radiusKm: '100' }
    props.city = '2' // Resolved API metadata may also supply the city.
    assert.deepEqual(parseArea(view.state.optionContext.value), { cityId: '2', radiusKm: 100 })
    props.areaQuery = {}
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

 test('map origin lookup resolves names and preserves saved viewport during delayed label lookup', async () => {
  for (const saved of [false, true]) {
    const query = saved ? { mapCity: '25', bounds: '10,40,20,50', page: '3' } : { city: 'vIeNnA', radius: '100' }
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
        assert.deepEqual(route.query, query, 'saved bounds and pagination remain unchanged')
      } else {
        assert.equal(view.state.focus.value.id, '25')
        assert.equal(route.query.mapCity, '25')
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

test('map links retain canonical IDs and readable names for markers, search and restored selections', async () => {
  const route = Vue.reactive({ query: { mapCity: '2', composers: 'Bach', dateFrom: '2026-10-01' } })
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route, async () => ({ items: [
    { value: '2', label: 'Bratislava', englishName: 'Bratislava', country_code: 'SK' },
  ] }))
  try {
    await view.ready
    assert.deepEqual(view.state.listLocation.value.query, { city: '2', cityName: 'Bratislava,SK', composers: 'Bach', dateFrom: '2026-10-01' })
    view.state.mapData.value.items = [{ id: '25', name: 'Wien', englishName: 'Vienna', country: 'AT' }]
    view.state.selectCity(view.state.mapData.value.items[0])
    assert.equal(view.state.listLocation.value.query.city, '25')
    assert.equal(route.query.mapCity, '25')
    assert.equal(route.query.cityName, 'Vienna,AT')
    assert.equal(parseConcertFilters(view.state.listLocation.value.query, 'SK').city.id, 25)
    assert.equal(view.state.selectedCity.value, '25')
    view.state.jump({ value: '1', label: 'Praha', englishName: 'Prague', country_code: 'CZ' })
    assert.equal(view.state.listLocation.value.query.city, '1')
    assert.equal(route.query.mapCity, '1')
    assert.equal(view.state.listParams.value.city, '1')
    route.query = { bounds: '10,40,20,50' }
    assert.deepEqual(view.state.listLocation.value.query, { bounds: '10,40,20,50' })
  } finally { view.unmount() }
})

 test('readable map URLs resolve IDs on reload and history navigation without changing saved state', async () => {
  const saved = { mapCity: 'Bratislava,SK', bounds: '10,40,20,50', page: '3', works: '12' }
  const route = Vue.reactive({ query: { ...saved } })
  const cities = {
    'Bratislava,SK': { value: '2', label: 'Bratislava', englishName: 'Bratislava', country_code: 'SK' },
    'Vienna,AT': { value: '25', label: 'Vienna', englishName: 'Vienna', country_code: 'AT' },
  }
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route, async (_url, { params }) => ({ items: [cities[params.origin]] }))
  try {
    await Vue.nextTick()
    assert.equal(view.state.selectedCity.value, '2')
    assert.equal(view.state.listParams.value.city, '2')
    assert.deepEqual(route.query, saved)
    assert.equal(view.state.focus.value, null)
    route.query = { ...saved, mapCity: 'Vienna,AT' }
    await Vue.nextTick()
    await Vue.nextTick()
    assert.equal(view.state.selectedCity.value, '25')
    assert.equal(view.state.selectedName.value, 'Vienna')
    view.state.setPage(4)
    assert.equal(route.query.mapCity, '25')
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
  const saved = { mapCity: '25', bounds: '10,40,20,50', page: '3' }
  const route = Vue.reactive({ query: { ...saved } })
  const view = await mount('../layers/concerts/app/pages/map.vue', {}, route)
  const settle = () => new Promise(resolve => setTimeout(resolve, 350))
  try {
    await view.ready
    view.state.moveMap('9,39,21,51', { restoring: true })
    await settle()
    assert.deepEqual(route.query, saved, 'initial fitBounds must not rewrite the saved query')
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
  const layer = { addTo() { return this }, on() {}, clearLayers() {} }
  const leaflet = { map: () => leafletMap, control: { zoom: () => layer, scale: () => layer }, layerGroup: () => layer, tileLayer: () => layer }
  const { descriptor } = parse(readFileSync(new URL('../layers/concerts/app/components/concert-map.client.vue', import.meta.url), 'utf8'))
  const executable = compileScript(descriptor, { id: 'leaflet-restoration' }).content
    .replace(/import \{([^}]+)\} from ['"][^'"]+['"]/, 'const { $1 } = utilities')
    .replace("import('leaflet')", 'Promise.resolve({ default: leaflet })')
    .replace("import('leaflet/dist/leaflet.css')", 'Promise.resolve()')
    .replace('export default', 'return')
  const component = new Function('Vue', 'utilities', 'leaflet', 'ResizeObserver', `
    const { ref, watch, onMounted, onBeforeUnmount } = Vue;
    const useConcertText = () => ({ t: text => text, locale: 'en-GB' });
    const useAppConfig = () => ({ concertSite: {} });
    const useRuntimeConfig = () => ({ public: {} });
    ${executable}
  `)(Vue, map, leaflet, class { constructor(callback) { resizeCallback = callback } observe() {} disconnect() {} })
  const props = Vue.reactive({ cities: [], bounds: '10,40,20,50', selected: null, focus: null })
  const app = renderer.createApp({ setup() { component.setup(props, { emit: (...args) => events.push(args), expose() {} }); return () => null } })
  app.mount({})
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
    for (const query of [{ bounds: '0,0,10,10' }, { mapCity: '25' }, { city: 'Vienna,AT' }]) {
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
      assert.equal(route.query.mapCity, id)
      assert.equal(route.query.cityName, 'Springfield,US')
      assert.equal(parseConcertFilters(view.state.listLocation.value.query).city.id, Number(id))
    }
    view.state.clearCity()
    assert.equal(route.query.cityName, undefined)
  } finally { view.unmount() }
})
