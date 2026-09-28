import assert from 'node:assert/strict'
import test from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { compileComponent } from '../test-support/vue.js'
import * as dates from '../layers/concerts/app/utils/concert-dates.js'
import * as discovery from '../layers/concerts/app/utils/concert-discovery.js'
import { getCountryName } from '../layers/concerts/app/utils/countries.js'
import { createConcertText } from '../layers/concerts/app/utils/concert-text.js'

const concert = {
  id: 285150, title: 'SVATOVÁCLAVSKÝ HUDEBNÍ FESTIVAL / OSTRAVA',
  url: 'https://example.com/concert', date: '2026-09-28', time_from: '18:00:00',
  country_code: 'CZ', source: 'Festival', works: [], composers: [],
}

async function render(row, { locale = 'en-GB', currentCityId = null, countryName = getCountryName } = {}) {
  const cityCalls = []
  const component = compileComponent('../layers/concerts/app/components/concerts-table.vue', {
    ...dates, ...discovery, getCountryName: countryName,
    useConcertText: () => createConcertText(locale),
    useRoute: () => ({ query: {} }),
    concertCityLocation: (...args) => {
      cityCalls.push(args)
      return discovery.concertCityLocation(...args)
    },
  }, { inlineTemplate: true })
  const app = createSSRApp(component, { concerts: [row], currentCityId })
  app.component('NuxtLink', {
    props: ['to', 'prefetch'],
    setup: (props, { slots }) => () => h('a', { href: props.to.path }, slots.default()),
  })
  app.component('ConcertProgramme', { render: () => h('div', 'Programme') })
  return { html: await renderToString(app), cityCalls }
}

for (const locale of ['en-GB', 'sk-SK']) {
  test(`missing cities preserve concert rendering and skip city navigation (${locale})`, async () => {
    for (const city of [null, undefined, '', '   ']) {
      for (const currentCityId of [null, '42']) {
        const row = { ...concert, city_id: 42 }
        if (city !== undefined) row.city = city
        const { html, cityCalls } = await render(row, { locale, currentCityId })
        assert.match(html, /SVATOVÁCLAVSKÝ HUDEBNÍ FESTIVAL/)
        assert.match(html, /18:00/)
        assert.match(html, /Festival/)
        assert.match(html, /Programme/)
        assert.equal((html.match(/location-badge/g) || []).length, 1, 'country badge remains')
        assert.equal(cityCalls.length, 0)
      }
    }
  })
}

test('valid cities retain links, current-city spans, and special badge colors', async () => {
  const row = { ...concert, city: 'Bratislava', city_id: 42, city_path: '/slovakia/bratislava' }
  const linked = await render(row)
  assert.equal(linked.cityCalls.length, 1)
  assert.match(linked.html, /href="\/slovakia\/bratislava"/)
  assert.match(linked.html, /text-blue-700[^>]*>Bratislava<\/span>/)
  const current = await render(row, { currentCityId: '42' })
  assert.equal(current.cityCalls.length, 0)
  assert.doesNotMatch(current.html, /href="\/slovakia\/bratislava"/)
  assert.match(current.html, /text-blue-700[^>]*>Bratislava<\/span>/)
})

test('outline badge helper tolerates missing and blank labels', async () => {
  for (const label of [null, undefined, '', '   ']) {
    const { html } = await render(concert, { countryName: () => label })
    assert.match(html, /text-rose-700/)
  }
})
