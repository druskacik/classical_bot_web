import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCityCatalogue } from '../shared/utils/city-catalogue.js'
import { CITY_SITEMAP_MIN_CONCERTS } from '../shared/utils/sitemap-inventory.js'
import { getConcertListSeoState } from '../app/composables/useConcertListSeo.js'

const city = (id, english_name, country_code = 'CZ') => ({ id, english_name, country_code, local_name: english_name })

test('canonical paths normalize accents and punctuation, with an ID fallback', () => {
  const { byId, byPath } = buildCityCatalogue([
    city(1, 'Prague'), city(2, 'České Budějovice'), city(3, 'L’Aquila', 'IT'), city(4, '東京', 'JP'),
  ])
  assert.equal(byId.get('1').path, '/czechia/prague')
  assert.equal(byId.get('2').path, '/czechia/ceske-budejovice')
  assert.equal(byId.get('3').path, '/italy/laquila')
  assert.equal(byId.get('4').path, '/japan/city-4')
  assert.equal(byPath.get('/czechia/prague').id, '1')
  assert.equal(byPath.has('/italy/prague'), false)
})

test('numeric identity order and reserved natural slugs prevent collisions', () => {
  const rows = [city('10', 'Frankfort', 'US'), city('2', 'Frankfort', 'US'), city('3', 'Frankfort-10', 'US')]
  const first = buildCityCatalogue(rows)
  assert.equal(first.byId.get('2').path, '/united-states/frankfort')
  assert.equal(first.byId.get('3').path, '/united-states/frankfort-10')
  assert.equal(first.byId.get('10').path, '/united-states/frankfort-10-10')
  assert.deepEqual([...first.byId], [...buildCityCatalogue(rows.reverse()).byId])
  assert.equal(first.byPath.size, 3)
})

test('inventory never participates in URL identity', () => {
  const rows = [city(1, 'Prague'), city(2, 'Prague')]
  assert.deepEqual([...buildCityCatalogue(rows).byId], [...buildCityCatalogue(rows.map(row => ({ ...row, count: 0 }))).byId])
})

test('index eligibility and sitemap promotion have independent boundaries', () => {
  for (const count of [0, 1, 9, 10]) {
    const state = getConcertListSeoState({ canonicalPath: '/czechia/prague', query: {}, indexable: count > 0 })
    assert.equal(state.robots, count === 0 ? 'noindex, follow' : 'index, follow')
    assert.equal(state.canonicalHref, count === 0 ? null : 'https://classicalbot.com/czechia/prague')
    assert.equal(count >= CITY_SITEMAP_MIN_CONCERTS, count === 10)
    assert.equal(getConcertListSeoState({ canonicalPath: '/czechia/prague', query: { page: '2' }, indexable: count > 0 }).canonicalHref, null)
  }
})
