import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { concertListPresentation, concertLocationKey } from '../layers/concerts/app/utils/concert-list-presentation.js'
import { resolveConcertDisplayCity } from '../layers/concerts/server/utils/concert-display-city.js'
import { getConcertListSeoState } from '../layers/concerts/app/composables/useConcertListSeo.js'

const composer = { type: 'composer', id: 1, name: 'Ludwig van Beethoven', profilePath: '/composers/1-ludwig-van-beethoven' }
const music = { composers: composer.name }
const work = { type: 'work', id: 6825, composerName: 'Claude Debussy', title: 'La mer', catalogueNumber: 'L. 109' }
const present = (query, extra = {}) => concertListPresentation(query, { subject: composer, ...extra })

test('composer heading, title and profile remain specific under combined filters', () => {
  assert.equal(present(music).heading, 'Ludwig van Beethoven concerts')
  assert.equal(present(music).title, 'Ludwig van Beethoven concerts worldwide — ClassicalBot')
  for (const dates of [{}, { dateFrom: '2026-11-01', dateTo: '2026-11-02' }]) {
    const query = { ...music, country: 'AU', ...dates }
    const result = present(query)
    assert.equal(result.heading, 'Ludwig van Beethoven concerts in Australia')
    assert.equal(result.title, 'Ludwig van Beethoven concerts in Australia — ClassicalBot')
    assert.equal(result.profilePath, composer.profilePath)
    assert.equal(result.profileLabel, 'Ludwig van Beethoven’s playlist and repertoire')
    assert.deepEqual(getConcertListSeoState({ origin: 'https://classicalbot.com', canonicalPath: '/', query,
      subjectDiscovery: true, discovery: { status: 'resolved', subject: composer } }), {
      robots: 'noindex, follow', canonicalHref: null,
    })
  }
})

test('work headings retain composer and catalogue without duplicate numbers or profile links', () => {
  for (const title of ['La mer', 'La mer, L.109']) {
    const result = present({ works: '6825', country: 'CZ', dateFrom: '2026-11-01' }, { subject: { ...work, title } })
    assert.equal(result.heading, `Claude Debussy: ${title === 'La mer' ? 'La mer, L. 109' : title} in Czechia`)
    assert.equal(result.profilePath, null)
  }
})

test('multiple, mixed and changed selections never reuse an old subject or profile', () => {
  for (const query of [{}, { composers: `${composer.name},Claude Debussy` }, { ...music, works: '6825' },
    { works: '1,2' }, { composers: 'Claude Debussy' }, { works: '6825' }]) {
    const result = present({ ...query, country: 'AU' })
    assert.equal(result.heading, 'Classical music concerts in Australia')
    assert.equal(result.profilePath, null)
  }
  assert.equal(present(music, { subject: null }).profilePath, null)
  assert.equal(present(music, { subject: { ...composer, profilePath: null } }).profilePath, null)
})

test('city labels are readable even with empty results and raw or missing city identities', () => {
  assert.equal(present({ ...music, city: '42', country: 'CZ' }, {
    city: { label: 'Prague', countryCode: 'CZ' },
  }).heading, 'Ludwig van Beethoven concerts in Prague, Czechia')
  assert.equal(present({ ...music, city: 'Nové Město nad Metují,CZ' }).heading,
    'Ludwig van Beethoven concerts in Nové Město nad Metují, Czechia')
  assert.equal(present({ ...music, city: '999999' }).heading, 'Ludwig van Beethoven concerts in the selected city')
})

test('area headings describe the actual geographic restriction', () => {
  const query = { ...music, city: 'Prague,CZ', radius: '50' }
  assert.equal(present(query, { area: { label: 'Prague' } }).heading,
    'Ludwig van Beethoven concerts within 50 km of Prague')
  assert.equal(present({ ...music, nearLat: '50', nearLng: '14', radius: '50' }).heading,
    'Ludwig van Beethoven concerts in the selected area')
  assert.equal(present({ ...query, bounds: '14,49,15,51' }, { area: { label: 'Prague' } }).heading,
    'Ludwig van Beethoven concerts in the map area')
})

test('retained location metadata matches geography, independently of music, date and pagination', () => {
  const query = { country: 'CZ', city: '42' }
  assert.equal(concertLocationKey(query), concertLocationKey({ ...query, ...music, page: '2', dateFrom: '2026-11-01' }))
  for (const change of [{ city: '43' }, { country: 'AU' }, { radius: '50' }, { bounds: '14,49,15,51' }, { nearLat: '50', nearLng: '14' }]) {
    assert.notEqual(concertLocationKey(query), concertLocationKey({ ...query, ...change }))
  }
})

test('city display resolution uses exact identities and preserves ambiguous readable names', async () => {
  const db = knex({ client: 'pg' })
  let rows = [{ id: 42, english_name: 'Prague', local_name: 'Praha', display_name: 'Prague', country_code: 'CZ' }]
  let sql, bindings
  db.client.runner = builder => ({ run: async () => {
    ({ sql, bindings } = builder.toSQL())
    return rows
  } })
  assert.equal(await resolveConcertDisplayCity(db, null), null)
  assert.deepEqual(await resolveConcertDisplayCity(db, { id: 42, name: null, country: null }), { label: 'Prague', countryCode: 'CZ' })
  assert.ok(sql.includes('"id" = ?'))
  assert.ok(bindings.includes(42))
  assert.deepEqual(await resolveConcertDisplayCity(db, { id: null, name: 'Praha', country: 'CZ' }), { label: 'Prague', countryCode: 'CZ' })
  assert.ok(bindings.includes('praha'))
  assert.ok(bindings.includes('CZ'))
  rows = [...rows, { ...rows[0], id: 43 }]
  assert.deepEqual(await resolveConcertDisplayCity(db, { id: null, name: 'Athens', country: 'US' }), { label: 'Athens', countryCode: 'US' })
  rows = []
  assert.deepEqual(await resolveConcertDisplayCity(db, { id: 999999, name: null, country: null }), { label: null, countryCode: null })
  await db.destroy()
})
