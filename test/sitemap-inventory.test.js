import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { buildCityCatalogue } from '../layers/concerts/shared/utils/city-catalogue.js'
import { buildSitemapInventory } from '../shared/utils/sitemap-inventory.js'
import { applyPublicConcertScope } from '../layers/concerts/server/utils/public-concerts.js'

test('sitemap includes only explicit pages, current countries, and matching cities with 10+ concerts', () => {
  const catalogue = buildCityCatalogue([0, 1, 9, 10].map((count, id) => ({
    id: id + 1, english_name: `City ${count}`, country_code: 'CZ',
  })))
  const counts = [1, 9, 10].map((count, i) => ({ city_id: i + 2, country_code_resolved: 'CZ', count: String(count) }))
  counts.push({ city_id: 1, country_code_resolved: 'SK', count: '100' })
  counts.push({ city_id: null, country_code_resolved: 'AT', count: '2' })
  const paths = buildSitemapInventory(catalogue, counts).map(item => item.loc)
  assert.deepEqual(paths, ['/', '/about', '/austria', '/composers', '/contact', '/czechia', '/czechia/city-10', '/slovakia', '/sources'])
  assert.equal(new Set(paths).size, paths.length)
})

test('empty inventory has only the fixed public pages', () => {
  assert.deepEqual(buildSitemapInventory(buildCityCatalogue([]), []),
    ['/', '/about', '/composers', '/contact', '/sources'].map(loc => ({ loc })))
})

test('composer sitemap paths come from the eligible directory and are deduplicated', () => {
  const paths = buildSitemapInventory(buildCityCatalogue([]), [], [
    { path: '/composers/3-ludwig-van-beethoven' }, { path: '/composers/3-ludwig-van-beethoven' },
  ]).map(item => item.loc)
  assert.equal(paths.filter(path => path === '/composers/3-ludwig-van-beethoven').length, 1)
})

test('shared scope uses current date, inclusion, deduplication, canonical city and resolved country', () => {
  const db = knex({ client: 'pg' })
  const query = applyPublicConcertScope(db('classical_concert as cc'), 'CZ', '123').toSQL()
  assert.match(query.sql, /"cc"\."date" >= CURRENT_DATE|cc.date >= CURRENT_DATE/)
  assert.match(query.sql, /"cc"\."duplicate_of_id" is null/)
  assert.match(query.sql, /"cc"\."inclusion_status" = \?/)
  assert.match(query.sql, /"cc"\."country_code_resolved" = \?/)
  assert.match(query.sql, /"cc"\."city_id" = \?/)
  assert.deepEqual(query.bindings, ['included', 'CZ', '123'])
})
