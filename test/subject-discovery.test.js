import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { getConcertListSeoState } from '../layers/concerts/app/composables/useConcertListSeo.js'
import { singleSubjectSelection, subjectListingPath, subjectMetadata } from '../layers/concerts/shared/utils/subject-discovery.js'
import { subjectDiscoveryLocation } from '../layers/concerts/app/utils/concert-discovery.js'
import { resolveDiscoverySubject } from '../layers/concerts/server/utils/subject-discovery.js'
import { buildSitemapInventory } from '../shared/utils/sitemap-inventory.js'
import { buildCityCatalogue } from '../layers/concerts/shared/utils/city-catalogue.js'
import { createSitemapInventoryCache } from '../server/utils/sitemap-inventory-cache.js'

const composer = { type: 'composer', id: 1, name: 'Claude Debussy' }
const work = { type: 'work', id: 2, title: 'La mer', composerName: 'Claude Debussy', catalogueNumber: 'L. 109' }
const seo = (query, subject = composer, extra = {}) => getConcertListSeoState({ origin: 'https://classicalbot.com', canonicalPath: '/czechia/prague', query,
  subjectDiscovery: true, discovery: { status: 'resolved', subject }, ...extra })

test('single subjects get their own canonical in each geographic scope with tracking removed', () => {
  for (const canonicalPath of ['/', '/czechia', '/czechia/prague']) {
    for (const subject of [composer, work]) {
      const query = subject.type === 'composer' ? { composers: subject.name } : { works: '02' }
      assert.deepEqual(seo({ ...query, page: '2', utm_source: 'email' }, subject, { canonicalPath }), {
        robots: 'index, follow', canonicalHref: `https://classicalbot.com${subjectListingPath(canonicalPath, subject, 2)}`,
      })
    }
  }
})

test('raw query, identity, inventory and site capability all gate indexing', () => {
  for (const query of [
    { composers: 'Claude Debussy,Maurice Ravel' }, { composers: ['Claude Debussy', 'Maurice Ravel'] },
    { composers: 'Claude Debussy', works: '2' }, { works: '2,3' }, { composers: 'Wrong name' },
    ...['city', 'country', 'dateFrom', 'dateTo', 'datePreset', 'radius', 'bounds', 'nearLat', 'unknown'].map(key => ({ composers: composer.name, [key]: 'value' })),
  ]) assert.equal(seo(query).robots, 'noindex, follow')
  for (const extra of [{ subjectDiscovery: false }, { indexable: false }, { discovery: { status: 'ambiguous' } }, { discovery: { status: 'unknown' } }]) {
    assert.deepEqual(seo({ composers: composer.name }, composer, extra), { robots: 'noindex, follow', canonicalHref: null })
  }
  assert.equal(seo({ works: '3' }, work).canonicalHref, null)
})

test('CSV composer names and accented text round-trip across links and canonical policy', () => {
  const subject = { type: 'composer', id: 10, name: 'Example, "Quoted" Dvořák' }
  const path = subjectListingPath('/czechia', subject)
  const query = Object.fromEntries(new URL(path, 'https://classicalbot.com').searchParams)
  assert.deepEqual(singleSubjectSelection(query), { type: 'composer', value: subject.name })
  assert.equal(seo(query, subject, { canonicalPath: '/czechia' }).canonicalHref, `https://classicalbot.com${path}`)
  const route = { path: '/czechia', query: { composers: 'Other', works: '7', page: '3', dateFrom: '2026-11-01', radius: '50' } }
  assert.equal(subjectDiscoveryLocation(route, subject), path)
  assert.equal(subjectDiscoveryLocation({ ...route, path: '/map' }, work), '/?works=2')
  assert.equal(route.query.page, '3')
})

test('subject metadata is geographic and catalogue numbers are not repeated', () => {
  assert.equal(subjectMetadata(composer).title, 'Claude Debussy concerts worldwide — ClassicalBot')
  assert.equal(subjectMetadata(work, 'in Prague, Czechia').heading, 'Claude Debussy: La mer, L. 109 in Prague, Czechia')
  assert.equal(subjectMetadata({ ...work, title: 'La mer, L.109' }).heading, 'Claude Debussy: La mer, L.109 worldwide')
})

test('subject resolution preserves exact identity, does not require Spotify and distinguishes failures', async () => {
  const db = knex({ client: 'pg' })
  let composerRows = [{ id: 1, name: composer.name }], workRow = { id: 2, title: 'La mer', composer_name: composer.name, catalogue_number: 'L. 109' }, playlist = null, fail = false
  db.client.runner = builder => ({ run: async () => {
    if (fail) throw new Error('Unavailable')
    const { sql, bindings } = builder.toSQL()
    if (sql.includes('composer_spotify_playlist')) return playlist
    if (sql.includes('from "composer"')) { assert.ok(bindings.includes(composer.name)); return composerRows }
    return workRow
  } })
  const filters = { composers: [composer.name], works: [] }
  const resolved = await resolveDiscoverySubject(db, filters)
  assert.equal(resolved.status, 'resolved')
  assert.equal(resolved.subject.profilePath, null)
  playlist = { id: 1 }
  assert.equal((await resolveDiscoverySubject(db, filters)).subject.profilePath, '/composers/1-claude-debussy')
  composerRows = [...composerRows, { id: 9, name: composer.name }]
  assert.equal((await resolveDiscoverySubject(db, filters)).status, 'ambiguous')
  composerRows = []
  assert.equal((await resolveDiscoverySubject(db, filters)).status, 'unknown')
  assert.equal((await resolveDiscoverySubject(db, { composers: [composer.name], works: [2] })).status, 'unsupported')
  assert.deepEqual((await resolveDiscoverySubject(db, { composers: [], works: [2] })).subject, work)
  workRow = { ...workRow, composer_name: null }
  assert.equal((await resolveDiscoverySubject(db, { composers: [], works: [2] })).status, 'unsupported')
  workRow = null
  assert.equal((await resolveDiscoverySubject(db, { composers: [], works: [2] })).status, 'unknown')
  fail = true
  await assert.rejects(resolveDiscoverySubject(db, filters), /Unavailable/)
})

test('sitemap subjects use observed nonempty groups and matching canonical geography', () => {
  const catalogue = buildCityCatalogue([{ id: 1, english_name: 'Prague', country_code: 'CZ' }])
  const row = { type: 'composer', id: 1, name: composer.name, count: 1, country_code_resolved: 'CZ', city_id: 1 }
  const paths = buildSitemapInventory(catalogue, [], [], [row, row,
    { ...row, type: 'work', id: 2 }, { ...row, id: 3, name: 'Empty', count: 0 },
    { ...row, id: 4, name: 'Mismatch', country_code_resolved: 'SK' },
  ]).map(entry => entry.loc)
  for (const path of ['/', '/czechia', '/czechia/prague']) {
    assert.ok(paths.includes(subjectListingPath(path, composer)))
    assert.ok(paths.includes(subjectListingPath(path, work)))
  }
  assert.ok(!paths.some(path => path.includes('Empty')))
  assert.ok(!paths.includes('/czechia/prague?composers=Mismatch'))
  assert.equal(new Set(paths).size, paths.length)
})

test('sitemap snapshot deduplicates refreshes and never publishes failed or partial inventory', async () => {
  let now = 0, calls = 0, fail = false
  const load = createSitemapInventoryCache(async () => {
    calls++
    if (fail) throw new Error('Unavailable')
    return [{ loc: `/${calls}` }]
  }, { maxAge: 100, now: () => now })
  fail = true
  await assert.rejects(load(), /Unavailable/)
  fail = false
  const [a, b] = await Promise.all([load(), load()])
  assert.equal(calls, 2)
  assert.strictEqual(a, b)
  assert.strictEqual(await load(), a)
  now = 101; fail = true
  assert.strictEqual(await load(), a)
  fail = false
  assert.deepEqual(await load(), [{ loc: '/4' }])
})
