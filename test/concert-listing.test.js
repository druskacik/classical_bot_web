import test from 'node:test'
import assert from 'node:assert/strict'
import { computed, effectScope, reactive, ref, unref } from 'vue'
import { useConcertListing } from '../layers/concerts/app/composables/useConcertListing.js'
import { cleanConcertQuery, normalizeConcertQuery } from '../layers/concerts/shared/utils/concert-query.js'

function mount(props = {}, query = {}, fetcher = async () => ({ items: [] })) {
  const previous = { useAsyncData: globalThis.useAsyncData, $fetch: globalThis.$fetch }
  const requests = [], scope = effectScope(), route = reactive({ query })
  props = reactive(props)
  globalThis.$fetch = fetcher
  globalThis.useAsyncData = (key, handler, options = {}) => {
    let settle
    const request = Object.assign(new Promise(resolve => { settle = resolve }), {
      key, options, data: ref(key === 'countries' ? [] : undefined), status: ref(options.immediate === false ? 'idle' : 'pending'), error: ref(null), settle: () => settle(),
      async refresh() {
        request.status.value = 'pending'
        try { request.data.value = await handler(); request.error.value = null; request.status.value = 'success' }
        catch (error) { request.error.value = error; request.status.value = 'error' }
        finally { settle() }
      },
    })
    requests.push(request)
    return request
  }
  const state = scope.run(() => useConcertListing(props, computed(() => normalizeConcertQuery(route.query))))
  return { state, props, route, requests, request: prefix => requests.find(request => unref(request.key).startsWith(prefix)), close() {
    scope.stop()
    requests.forEach(request => request.settle())
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value }
  } }
}

test('listing projects normalized filters into listing and country-facet requests', async () => {
  const music = { composers: 'Mozart,"Joseph Bologne, Chevalier de Saint-Georges"', works: '1,2', dateFrom: '2099-01-01' }
  const cases = [
    [{}, { ...music, country: ['AT', 'US'], city: 'Vienna,AT', bounds: '10,40,20,55', datePreset: 'custom', page: 'bad' },
      { ...music, country: 'AT', city: 'Vienna,AT', bounds: '10,40,20,55', page: 'bad' }, { ...music, bounds: '10,40,20,55', selected: 'AT' }],
    [{ countryCode: 'AT', cityPage: { id: '25' } }, { ...music, radius: '050', page: '2' },
      { ...music, city: '25', radius: '050', page: '2' }, { ...music, city: '25', radius: '50', selected: 'AT' }],
    [{ countryCode: 'SK', cityPage: { id: '2' } }, { ...music, radius: '50', page: '2' },
      { ...music, city: '2', radius: '50', page: '2' }, { ...music, city: '2', radius: '50', selected: 'SK' }],
    [{}, { ...music, nearLat: '48.15', nearLng: '17.11', radius: '100', page: '0' },
      { ...music, nearLat: '48.15', nearLng: '17.11', radius: '100', page: '0' }, { ...music, nearLat: '48.15', nearLng: '17.11', radius: '100' }],
    [{ countryCode: 'SK', cityPage: { filterValue: 'Pezinok,SK' } }, {},
      { country: 'SK', city: 'Pezinok,SK' }, { selected: 'SK' }],
    [{}, { country: 'AT', city: 'Vienna,AT', radius: '0' },
      { country: 'AT', city: 'Vienna,AT', radius: '0' }, { radius: '0', selected: 'AT' }],
  ]
  for (const [props, query, listing, facets] of cases) {
    const calls = []
    const view = mount(props, query, async (url, { params }) => { calls.push({ url, params }); return { items: [] } })
    try {
      assert.deepEqual(cleanConcertQuery(view.state.requestParams.value), listing)
      await view.request('concerts:').refresh()
      await view.request('country-options:').refresh()
      assert.deepEqual(calls[0], { url: '/api/get-concerts', params: view.state.requestParams.value })
      const facetRequest = JSON.parse(unref(view.request('country-options:').key).slice('country-options:'.length))
      assert.deepEqual(facetRequest, { ...facets, type: 'country' })
      assert.equal(calls.length, props.countryCode ? 1 : 2, 'Fixed-country pages suppress the facet HTTP request')
      assert.deepEqual(view.state.filters.value.composers, music.composers === query.composers ? ['Mozart', 'Joseph Bologne, Chevalier de Saint-Georges'] : [])
    } finally { view.close() }
  }
})

test('country options stay idle and do not block the initial listing', async () => {
  let resolveListing
  const pending = new Promise(resolve => { resolveListing = resolve })
  const view = mount({}, {}, async url => url === '/api/get-concerts' ? pending : url === '/api/get-countries' ? [] : { items: [] })
  try {
    assert.deepEqual(view.requests.map(request => unref(request.key).split(':')[0]), ['countries', 'concerts', 'country-options'])
    let ready = false
    view.state.ready.then(() => { ready = true })
    const loading = view.request('concerts:').refresh()
    await view.request('countries').refresh()
    assert.deepEqual(view.request('country-options:').options, { immediate: false, server: false, lazy: true })
    assert.equal(view.state.countryOptionsStatus.value, 'idle')
    assert.equal(ready, false)
    resolveListing({ items: [], total: 0 })
    await loading
    await view.state.ready
    assert.equal(ready, true)
  } finally { view.close() }
})

test('responses retain their original query and display data survives a pending refresh', async () => {
  let respond
  const view = mount({}, { country: 'AT', composers: 'Mozart' }, () => new Promise(resolve => { respond = resolve }))
  try {
    const request = view.request('concerts:')
    const loading = request.refresh()
    view.route.query = { country: 'US', composers: 'Bach' }
    respond({ items: [], discovery: { status: 'resolved', subject: { name: 'Mozart' } } })
    await loading
    assert.equal(view.state.concertPage.value.displayQuery.country, 'AT')
    assert.equal(view.state.requestParams.value.country, 'US')
    const displayed = view.state.displayPage.value
    request.data.value = undefined
    request.status.value = 'pending'
    assert.deepEqual(view.state.displayPage.value, displayed)
    request.data.value = { items: [], displayQuery: { country: 'US', composers: 'Bach' } }
    assert.equal(view.state.displayPage.value.displayQuery.country, 'US')
  } finally { view.close() }
})

test('country failure restores the selected label and listing errors remain available to the page', async () => {
  let failed = true
  const error = Object.assign(new Error('Unavailable'), { statusCode: 503 })
  const view = mount({}, { country: 'SK' }, async () => { if (failed) throw error; return { items: [{ value: 'SK', label: 'Slovakia', count: 3 }] } })
  try {
    view.request('countries').data.value = [{ code: 'SK', name: 'Slovakia' }]
    await view.request('country-options:').refresh()
    assert.deepEqual(view.state.filterCountries.value, [{ code: 'SK', name: 'Slovakia', count: null }])
    await view.request('concerts:').refresh()
    view.request('countries').settle()
    await view.state.ready
    assert.equal(view.state.concertError.value.statusCode, 503)
    assert.equal(view.state.concertStatus.value, 'error')
    failed = false
    await view.state.refreshCountryOptions()
    assert.deepEqual(view.state.filterCountries.value, [{ code: 'SK', name: 'Slovakia', count: 3 }])
    await view.state.refreshConcerts()
    assert.equal(view.state.concertError.value, null)
    assert.equal(view.state.concertStatus.value, 'success')
  } finally { view.close() }
})


test('country interaction loads once, keeps fallback names usable, and allows retries', async () => {
  let respond, calls = 0
  const view = mount({}, { country: 'SK' }, () => { calls++; return new Promise(resolve => { respond = resolve }) })
  try {
    view.request('countries').data.value = [{ code: 'AT', name: 'Austria', count: 10 }, { code: 'SK', name: 'Slovakia', count: 20 }]
    assert.deepEqual(view.state.filterCountries.value.map(x => [x.name, x.count]), [['Austria', null], ['Slovakia', null]])
    const loading = view.state.loadCountryOptions()
    view.state.loadCountryOptions()
    assert.equal(calls, 1)
    assert.equal(view.state.filterCountries.value[1].name, 'Slovakia')
    respond({ items: [{ value: 'SK', label: 'Slovakia', count: 3 }] })
    await loading
    assert.deepEqual(view.state.filterCountries.value, [{ code: 'SK', name: 'Slovakia', count: 3 }])
    view.state.loadCountryOptions()
    assert.equal(calls, 1)
    view.request('country-options:').status.value = 'error'
    const retry = view.state.loadCountryOptions()
    assert.equal(calls, 2)
    respond({ items: [] })
    await retry
  } finally { view.close() }
})
