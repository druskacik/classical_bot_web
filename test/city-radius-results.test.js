import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import knex from 'knex'
import { parseConcertFilters, applyFilters } from '../layers/concerts/server/utils/concert-filters.js'
import { resolveArea, publicArea } from '../layers/concerts/server/utils/concert-area.js'
import { concertFilterCacheInput } from '../layers/concerts/server/utils/data-cache-keys.js'

const cities = [
  { id: 105, english_name: 'Birmingham', local_name: 'Birmingham', country_code: 'GB', latitude: 52.48142, longitude: -1.89983 },
  { id: 1061, english_name: 'Wolverhampton', local_name: 'Wolverhampton', country_code: 'GB', latitude: 52.58547, longitude: -2.12296 },
  { id: 745, english_name: 'Birmingham', local_name: 'Birmingham', country_code: 'US', latitude: 33.52066, longitude: -86.80249 },
]
const compiler = knex({ client: 'pg' })
const filtersFor = (query, country = null) => {
  const filters = parseConcertFilters(query, country)
  if (filters.area) filters.area = resolveArea(filters.area, cities)
  return filters
}

test('Birmingham radius retains unlinked concerts without admitting unrelated or hidden concerts', t => {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(`CREATE TABLE city (id INTEGER, english_name TEXT, local_name TEXT, country_code TEXT, latitude REAL, longitude REAL);
    CREATE TABLE classical_concert (id INTEGER, city_id INTEGER, city_raw TEXT, country_code_resolved TEXT, country_code_raw TEXT,
      date TEXT, inclusion_status TEXT, duplicate_of_id INTEGER);
    CREATE TABLE composer (id INTEGER, name TEXT);
    CREATE TABLE classical_concert_composer (classical_concert_id INTEGER, composer_id INTEGER);
    CREATE TABLE classical_concert_work (classical_concert_id INTEGER, work_id INTEGER);
    INSERT INTO composer VALUES (1, 'Mozart');`)
  for (const city of cities) db.prepare('INSERT INTO city VALUES (?, ?, ?, ?, ?, ?)').run(...Object.values(city))
  const insert = db.prepare('INSERT INTO classical_concert VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const add = (id, overrides = {}) => {
    const row = { city: null, name: 'Birmingham', resolved: null, raw: 'GB', date: '2099-01-01', status: 'included', duplicate: null, ...overrides }
    insert.run(id, ...Object.values(row))
  }
  for (let id = 1; id <= 287; id++) add(id, { city: 105, resolved: 'GB' })
  add(288)
  add(289, { name: 'bIrMiNgHaM' })
  add(290, { resolved: 'GB', raw: 'US' })
  add(291, { city: 1061, name: 'Wolverhampton', resolved: 'GB' })
  add(292, { raw: 'US' })
  add(293, { resolved: 'US' })
  add(294, { raw: null })
  add(295, { city: 745 })
  add(296, { name: 'Wolverhampton' })
  add(297, { status: 'excluded' })
  add(298, { duplicate: 288 })
  add(299, { date: '2000-01-01' })
  const select = filters => {
    const query = applyFilters(compiler('classical_concert as cc').leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), filters)
      .select('cc.id').orderBy('cc.id').toSQL()
    // SQLite LIKE provides PostgreSQL ILIKE semantics for these ASCII fixtures.
    return db.prepare(query.sql.replaceAll(' ilike ', ' like ')).all(...query.bindings).map(row => row.id)
  }
  const exact = select(filtersFor({ city: 'Birmingham,GB' }))
  assert.equal(exact.length, 290)
  const area = filtersFor({ city: 'Birmingham,GB', radius: '25' })
  const expanded = select(area)
  assert.deepEqual(expanded, [...exact, 291])
  for (const radius of ['25', '50', '100']) {
    assert.deepEqual(select(filtersFor({ city: '105', radius })), expanded)
  }
  assert.deepEqual(select(filtersFor({ city: '105', radius: '25' })), expanded)
  assert.equal(select(filtersFor({ nearLat: '52.48142', nearLng: '-1.89983', radius: '25' })).length, 288)
  assert.deepEqual(select(filtersFor({ city: 'Birmingham,GB', radius: '25', dateFrom: '2099-02-01' })), [])
  assert.deepEqual(select(filtersFor({ city: 'Birmingham,GB', radius: '25' }, 'SK')), [])
  assert.deepEqual(select(filtersFor({ city: 'Birmingham,GB', radius: '25', bounds: '-3,50,-2,54' })), [291])
  db.exec('INSERT INTO classical_concert_composer VALUES (288, 1); INSERT INTO classical_concert_work VALUES (288, 7);')
  assert.deepEqual(select(filtersFor({ city: 'Birmingham,GB', radius: '25', composers: 'Mozart', works: '7' })), [288])
  assert.deepEqual(select(filtersFor({ city: 'Birmingham,GB', radius: '25', composers: 'Mozart', works: '8' })), [])

  // Local names are literal: SQL wildcard characters must not broaden the match.
  const renamed = cities.map(city => city.id === 105 ? { ...city, local_name: 'Local_%' } : city)
  add(300, { name: 'LOCAL_%' })
  add(301, { name: 'LocalXYZ' })
  const local = { ...area, area: resolveArea({ cityId: '105', radiusKm: 25 }, renamed) }
  assert.deepEqual(select(local), [...expanded, 300])
})

test('fallback metadata is private and participates in cache identity', () => {
  const filters = filtersFor({ city: 'Birmingham,GB', radius: '25' })
  assert.equal(publicArea(filters.area).unresolvedCity, undefined)
  const key = concertFilterCacheInput(filters)
  for (const unresolvedCity of [null, { names: ['another name'], countryCode: 'GB' }, { names: ['birmingham'], countryCode: 'US' }]) {
    assert.notDeepEqual(concertFilterCacheInput({ ...filters, area: { ...filters.area, unresolvedCity } }), key)
  }
})
