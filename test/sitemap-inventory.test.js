import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { buildCityCatalogue } from '../layers/concerts/shared/utils/city-catalogue.js'
import { buildSitemapInventory } from '../shared/utils/sitemap-inventory.js'
import { applyPublicConcertScope } from '../layers/concerts/server/utils/public-concerts.js'

test('sitemap includes only explicit pages, current countries, and matching cities with 1+ concerts', () => {
  const catalogue = buildCityCatalogue([0, 1, 9, 10].map((count, id) => ({
    id: id + 1, english_name: `City ${count}`, country_code: 'CZ',
  })))
  const counts = [1, 9, 10].map((count, i) => ({ city_id: i + 2, country_code_resolved: 'CZ', count: String(count) }))
  counts.push({ city_id: 1, country_code_resolved: 'SK', count: '100' })
  counts.push({ city_id: null, country_code_resolved: 'AT', count: '2' })
  const paths = buildSitemapInventory(catalogue, counts).map(item => item.loc)
  assert.deepEqual(paths, ['/', '/about', '/api', '/api/docs', '/austria', '/blog', '/composers', '/contact', '/czechia', '/czechia/city-1', '/czechia/city-10', '/czechia/city-9', '/slovakia', '/sources'])
  assert.equal(new Set(paths).size, paths.length)
})

test('empty inventory has only the fixed public pages', () => {
  assert.deepEqual(buildSitemapInventory(buildCityCatalogue([]), []),
    ['/', '/about', '/api', '/api/docs', '/blog', '/composers', '/contact', '/sources'].map(loc => ({ loc })))
})

test('composer sitemap paths come from the eligible directory and are deduplicated', () => {
  const paths = buildSitemapInventory(buildCityCatalogue([]), [], [
    { path: '/composers/3-ludwig-van-beethoven' }, { path: '/composers/3-ludwig-van-beethoven' },
  ]).map(item => item.loc)
  assert.equal(paths.filter(path => path === '/composers/3-ludwig-van-beethoven').length, 1)
})

test('shared scope trusts resolved eligibility and keeps upcoming, city and country restrictions', () => {
  const db = knex({ client: 'pg' })
  const query = applyPublicConcertScope(db('resolved_concert as cc'), 'CZ', '123').toSQL()
  assert.match(query.sql, /"cc"\."date" >= CURRENT_DATE|cc.date >= CURRENT_DATE/)
  assert.doesNotMatch(query.sql, /duplicate_of_id|inclusion_status/)
  assert.match(query.sql, /"cc"\."country_code_resolved" = \?/)
  assert.match(query.sql, /"cc"\."city_id" = \?/)
  assert.deepEqual(query.bindings, ['CZ', '123'])
})
