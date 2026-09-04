import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { resolveConcertDateMode, concertDatePreset, formatConcertDateRange, updateConcertQuery, concertCityLocation, concertCountryLocation, concertComposerLocation } from '../app/utils/concert-discovery.js'

test('date presets use calendar days and handle weekend/month/year boundaries', () => {
  for (const [today, from, to] of [
    ['2026-09-04', '2026-09-05', '2026-09-06'],
    ['2026-09-05', '2026-09-05', '2026-09-06'],
    ['2026-09-06', '2026-09-06', '2026-09-06'],
    ['2026-09-07', '2026-09-12', '2026-09-13'],
    ['2026-01-30', '2026-01-31', '2026-02-01'],
    ['2026-12-31', '2027-01-02', '2027-01-03'],
  ]) {
    const now = new Date(`${today}T23:45:00`)
    assert.deepEqual(concertDatePreset('weekend', now), { dateFrom: from, dateTo: to })
    assert.deepEqual(concertDatePreset('week', now), { dateFrom: today, dateTo: to })
    assert.deepEqual(concertDatePreset('today', now), { dateFrom: today, dateTo: today })
    assert.deepEqual(concertDatePreset('any', now), { dateFrom: null, dateTo: null })
  }
})

test('presets survive DST and use local dates rather than UTC dates', () => {
  const moduleUrl = new URL('../app/utils/concert-discovery.js', import.meta.url).href
  for (const [zone, instant, expected] of [
    ['Europe/Prague', '2026-03-28T23:45:00', ['2026-03-28', '2026-03-29']],
    ['Europe/Prague', '2026-10-24T23:45:00', ['2026-10-24', '2026-10-25']],
    ['America/New_York', '2026-03-07T23:45:00', ['2026-03-07', '2026-03-08']],
    ['Pacific/Auckland', '2026-09-05T00:15:00', ['2026-09-05', '2026-09-06']],
  ]) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import { concertDatePreset } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(concertDatePreset('weekend', new Date(${JSON.stringify(instant)}))))`], { env: { ...process.env, TZ: zone }, encoding: 'utf8' })
    assert.deepEqual(JSON.parse(output), { dateFrom: expected[0], dateTo: expected[1] })
  }
})

const query = { country: 'CZ', city: 'Prague,CZ', dateFrom: '2026-09-05', dateTo: '2026-09-06', composers: 'Mozart', works: '42', page: '2' }
test('filter updates are atomic, reset pagination and clear city only for country changes', () => {
  assert.deepEqual(updateConcertQuery(query, { dateFrom: null, dateTo: null }), { country: 'CZ', city: 'Prague,CZ', composers: 'Mozart', works: '42' })
  assert.deepEqual(updateConcertQuery(query, { composers: [], works: [] }), { country: 'CZ', city: 'Prague,CZ', dateFrom: query.dateFrom, dateTo: query.dateTo })
  assert.equal(updateConcertQuery(query, { country: 'AT' }).city, undefined)
  assert.equal(query.page, '2')
})

test('city and country navigation preserve dates/music and remove redundant location queries', () => {
  const preserved = { dateFrom: query.dateFrom, dateTo: query.dateTo, composers: 'Mozart', works: '42' }
  assert.deepEqual(concertCityLocation(query, { city_path: '/czechia/prague' }), { path: '/czechia/prague', query: preserved })
  assert.deepEqual(concertCityLocation(query, { city: 'Vienna', country_code: 'AT' }), { path: '/', query: { ...preserved, country: 'AT', city: 'Vienna,AT' } })
  assert.deepEqual(concertCountryLocation(query, 'AT'), { path: '/austria', query: preserved })
  assert.deepEqual(concertCityLocation(query, { city: 'Unknown' }), { path: '/', query: { ...preserved, city: 'Unknown' } })
})

test('composer refinements preserve route and selections, deduplicate and reset page', () => {
  const result = concertComposerLocation({ path: '/czechia/prague', query }, 'Beethoven')
  assert.equal(result.path, '/czechia/prague')
  assert.deepEqual(result.query, { ...updateConcertQuery(query, {}), composers: 'Mozart,Beethoven' })
  assert.equal(concertComposerLocation({ path: '/', query }, 'Mozart').query.composers, 'Mozart')
})

test('date summaries support one-sided ranges and tolerate malformed URLs', () => {
  assert.equal(formatConcertDateRange(null, null), '')
  assert.equal(formatConcertDateRange('2026-09-05', null), 'From 5 Sept 2026')
  assert.equal(formatConcertDateRange(null, '2026-09-06'), 'Until 6 Sept 2026')
  assert.equal(formatConcertDateRange('2026-09-05', '2026-09-05'), '5 Sept 2026')
  assert.equal(formatConcertDateRange('bad', null), 'From bad')
})


test('preset labels restore only when explicit dates match the current local preset', () => {
  const now = new Date('2026-09-04T12:00:00')
  for (const preset of ['today', 'week', 'weekend']) {
    const range = concertDatePreset(preset, now)
    assert.equal(resolveConcertDateMode(preset, range.dateFrom, range.dateTo, now), preset)
    assert.equal(resolveConcertDateMode(preset, range.dateFrom, range.dateTo, new Date('2026-09-14T12:00:00')), 'custom')
    assert.equal(resolveConcertDateMode(null, range.dateFrom, range.dateTo, now), 'custom')
  }
  assert.equal(resolveConcertDateMode('weekend', '2026-09-05', '2026-09-06', new Date('2026-09-06T12:00:00')), 'custom')
  assert.equal(resolveConcertDateMode('invalid', '2026-09-05', '2026-09-06', now), 'custom')
  assert.equal(resolveConcertDateMode('today', '2026-09-04', null, now), 'custom')
  assert.equal(resolveConcertDateMode('today', null, null, now), 'any')
  assert.equal(resolveConcertDateMode('today', '2026-09-04', '2026-09-04', null), 'custom')
})

test('preset metadata follows navigation but is cleared by manual date edits and recovery', () => {
  const selected = { ...query, datePreset: 'weekend' }
  assert.equal(updateConcertQuery(selected, { composers: ['Bach'] }).datePreset, 'weekend')
  assert.equal(concertCityLocation(selected, { city_path: '/czechia/prague' }).query.datePreset, 'weekend')
  assert.equal(concertCountryLocation(selected, 'AT').query.datePreset, 'weekend')
  assert.equal(updateConcertQuery(selected, { dateFrom: '2026-09-06' }).datePreset, undefined)
  assert.equal(updateConcertQuery(selected, { dateFrom: null, dateTo: null }).datePreset, undefined)
  assert.equal(updateConcertQuery(selected, { dateFrom: '2026-09-04', dateTo: '2026-09-04', datePreset: 'today' }).datePreset, 'today')
})
