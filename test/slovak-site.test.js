import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { parseConcertFilters, facetFilters, applyFilters } from '../layers/concerts/server/utils/concert-filters.js'
import { buildLocalCityCatalogue, addUnresolvedLocalCities } from '../layers/concerts/shared/utils/local-city-catalogue.js'
import { buildSlovakSitemapInventory } from '../apps/classical-sk/shared/utils/sitemap-inventory.js'
import { createConcertText } from '../layers/concerts/app/utils/concert-text.js'
import { formatConcertDateRange } from '../layers/concerts/app/utils/concert-discovery.js'

globalThis.createError = details => Object.assign(new Error(details.statusMessage), details)
const db = knex({ client: 'pg' })

test('Slovak scope survives every facet exclusion and cannot be widened by a query', () => {
  for (const query of [{ country: 'CZ' }, { country: ['CZ', 'SK'] }, { city: 'Prague,CZ' }]) {
    assert.throws(() => parseConcertFilters(query, 'SK'), { statusCode: 400 })
  }
  const filters = parseConcertFilters({ city: '2', composers: 'Mozart', works: '1' }, 'SK')
  for (const type of ['country', 'city', 'composer', 'work']) {
    const context = facetFilters(filters, type)
    assert.equal(context.siteCountry, 'SK')
    const sql = applyFilters(db('classical_concert as cc'), context).toSQL()
    assert.match(sql.sql, /"cc"\."country_code_resolved" = \?/)
    assert.ok(sql.bindings.includes('SK'))
    assert.match(sql.sql, /"cc"\."duplicate_of_id" is null/)
    assert.ok(sql.bindings.includes('included'))
  }
  assert.equal(parseConcertFilters({}).country, null)
  assert.equal(parseConcertFilters({ country: 'CZ' }).country, 'CZ')
})

const rows = [
  { id: 1, local_name: 'Praha', english_name: 'Prague', country_code: 'CZ' },
  { id: 2, local_name: 'Bratislava', english_name: 'Bratislava', country_code: 'SK' },
  { id: 3, local_name: 'Trenčín', english_name: 'Trencin', country_code: 'SK' },
  { id: 4, local_name: 'Banská Bystrica', english_name: 'Banská Bystrica', country_code: 'SK' },
]

test('Slovak city identities preserve local URLs and exclude foreign cities', () => {
  const catalogue = buildLocalCityCatalogue(rows, 'SK')
  assert.equal(catalogue.byPath.get('/Bratislava').id, '2')
  assert.equal(catalogue.byPath.get('/Trenčín').path, '/Tren%C4%8D%C3%ADn')
  assert.equal(catalogue.byPath.get('/Banská Bystrica').path, '/Bansk%C3%A1%20Bystrica')
  assert.equal(catalogue.byId.has('1'), false)
  assert.equal(catalogue.byPath.has('/slovakia/bratislava'), false)
  addUnresolvedLocalCities(catalogue, ['Pezinok', 'kontakt', 'Bratislava'], 'SK')
  assert.equal(catalogue.byPath.get('/Pezinok').filterValue, 'Pezinok,SK')
  assert.equal(catalogue.byPath.get('/Pezinok').id, null)
  assert.equal(catalogue.byPath.has('/kontakt'), false)
  assert.equal(catalogue.byPath.get('/Bratislava').id, '2')
})

test('local URL collisions reserve editorial routes and remain independent of row order', () => {
  const cities = [
    { id: 10, local_name: 'Same', country_code: 'SK' },
    { id: 2, local_name: 'Same', country_code: 'SK' },
    { id: 3, local_name: 'Same-10', country_code: 'SK' },
    { id: 4, local_name: 'blog', country_code: 'SK' },
  ]
  const first = buildLocalCityCatalogue(cities, 'SK')
  assert.equal(first.byId.get('10').path, '/Same-10-10')
  assert.equal(first.byId.get('4').path, '/blog-4')
  assert.deepEqual([...first.byId], [...buildLocalCityCatalogue(cities.reverse(), 'SK').byId])
})

test('Slovak sitemap contains its editorial pages and only eligible Slovak cities', () => {
  const catalogue = buildLocalCityCatalogue(rows, 'SK')
  const urls = buildSlovakSitemapInventory(catalogue, [
    { city_id: 1, country_code_resolved: 'CZ', count: 100 },
    { city_id: 2, country_code_resolved: 'SK', count: 10 },
    { city_id: 3, country_code_resolved: 'SK', count: 9 },
    { city_id: 4, country_code_resolved: 'CZ', count: 100 },
  ]).map(item => item.loc)
  assert.deepEqual(urls, ['/', '/Bratislava', '/blog', '/blog/o-projekte', '/kontakt', '/zdroje'])
  const unicode = buildSlovakSitemapInventory(catalogue, [{ city_id: 3, country_code_resolved: 'SK', count: 10 }])
  assert.ok(unicode.some(item => item.loc === '/Trenčín'))
  assert.ok(unicode.every(item => !item.loc.includes('%')))
})

test('translation and date formatting keep English output and handle Slovak plural forms', () => {
  const en = createConcertText(), sk = createConcertText('sk-SK')
  assert.equal(en.activeFilters(2), '2 active filters')
  assert.equal(en.availableOptions(1), '1 option available.')
  assert.equal(en.t('Remove {label} filter', { label: 'Mozart' }), 'Remove Mozart filter')
  assert.equal(sk.t('Remove {label} filter', { label: 'Mozart' }), 'Odstrániť filter Mozart')
  assert.deepEqual([1, 2, 5].map(n => sk.plural('concert', n)), ['koncert', 'koncerty', 'koncertov'])
  assert.equal(sk.activeFilters(2), '2 aktívne filtre')
  assert.match(formatConcertDateRange('2026-09-05', null, 'sk-SK', { from: 'Od', until: 'Do' }), /^Od /)
})
