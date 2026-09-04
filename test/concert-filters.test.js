import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { applyFilters, facetFilters, parseConcertFilters } from '../server/utils/concert-filters.js'

globalThis.createError = details => Object.assign(new Error(details.statusMessage), details)
const db = knex({ client: 'pg' })
const input = { country: 'CZ', city: 'Prague,CZ', dateFrom: '2026-09-05', dateTo: '2026-09-06', composers: 'Beethoven,Mozart', works: '1,2' }

test('facet scopes keep other categories and do not mutate listing filters', () => {
  const filters = parseConcertFilters(input)
  assert.deepEqual(facetFilters(filters, 'country'), { ...filters, country: null, city: null })
  assert.deepEqual(facetFilters(filters, 'city'), { ...filters, city: null })
  assert.deepEqual(facetFilters(filters, 'composer'), { ...filters, composers: [] })
  assert.deepEqual(facetFilters(filters, 'work'), { ...filters, works: [] })
  assert.equal(filters.city.name, 'Prague')
  assert.deepEqual(filters.works, [1, 2])
})

test('shared parser preserves canonical IDs and validates dates and geography', () => {
  assert.deepEqual(parseConcertFilters({ city: '123' }).city, { id: 123, name: null, country: null })
  assert.equal(parseConcertFilters({ dateTo: '2028-02-29' }).dateFrom, null)
  for (const query of [{ dateFrom: '2026-02-29' }, { dateFrom: '2026-09-06', dateTo: '2026-09-05' }, { country: 'AT', city: 'Prague,CZ' }, { works: '0' }]) {
    assert.throws(() => parseConcertFilters(query), { statusCode: 400 })
  }
})

test('music constraints use EXISTS so multiple matching works cannot multiply concerts', () => {
  const sql = applyFilters(db('classical_concert as cc').leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), parseConcertFilters(input)).toSQL()
  assert.equal((sql.sql.match(/exists \(/g) || []).length, 2)
  assert.match(sql.sql, /"cc"\."date" >= \?/)
  assert.match(sql.sql, /"cc"\."date" <= \?/)
  assert.match(sql.sql, /"cc"\."duplicate_of_id" is null/)
  assert.ok(sql.bindings.includes('2026-09-05'))
  assert.ok(sql.bindings.includes('2026-09-06'))
  assert.ok(sql.bindings.includes('Beethoven'))
  assert.ok(sql.bindings.includes('Mozart'))
})
