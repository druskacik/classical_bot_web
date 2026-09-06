import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { composerPath, composerIdFromSlug, catalogueLabel, seasonLabel, workLocation, composerConcertLocation } from '../shared/utils/composers.js'
import { publishedPlaylists, rankedWorks, composerCounts } from '../server/utils/composer-queries.js'

test('composer identity survives diacritics, duplicate names, and renamed slugs', () => {
  assert.equal(composerPath(2, 'Antonín Dvořák'), '/composers/2-antonin-dvorak')
  assert.notEqual(composerPath(1, 'Same Name'), composerPath(2, 'Same Name'))
  assert.equal(composerIdFromSlug('2-old-name'), 2)
  assert.equal(composerIdFromSlug('2'), 2)
  for (const value of ['0-name', '-2-name', '02-name', '2147483648-name', 'NaN', '3junk', ['3']]) {
    assert.equal(composerIdFromSlug(value), null)
  }
})

test('work and composer links start a fresh worldwide concert search', () => {
  assert.deepEqual(workLocation(241), { path: '/', query: { works: '241' } })
  assert.deepEqual(composerConcertLocation('Antonín Dvořák'), { path: '/', query: { composers: 'Antonín Dvořák' } })
})

test('catalogue numbers are not repeated and actual playlist season is formatted', () => {
  assert.equal(catalogueLabel('Symphony No. 5 in C minor', 'Op. 67'), 'Op. 67')
  assert.equal(catalogueLabel('Symphony No. 4, op.60', 'Op. 60'), null)
  assert.equal(catalogueLabel('Symphony', null), null)
  assert.equal(seasonLabel('2026-07-01', '2027-07-01'), '2026/27')
  assert.equal(seasonLabel('2026-01-01', '2026-12-31'), '2026')
})

test('playlist eligibility selects one public published season deterministically', () => {
  const query = publishedPlaylists(knex({ client: 'pg' })).toSQL()
  assert.match(query.sql, /distinct on \("p"\."composer_id"\)/)
  assert.match(query.sql, /"p"\."season_start" desc, "p"\."last_synced_at" desc nulls last, "p"\."id" desc/)
  assert.deepEqual(query.bindings, ['published', true])
})

test('live rankings and directory counts exclude hidden and duplicate concerts and count each concert once', () => {
  const db = knex({ client: 'pg' })
  for (const query of [rankedWorks(db, 3).toSQL(), composerCounts(db, [3, 2]).toSQL()]) {
    assert.match(query.sql, /count\(distinct "cc"\."id"\)/)
    assert.match(query.sql, /cc.date >= CURRENT_DATE/)
    assert.match(query.sql, /"cc"\."duplicate_of_id" is null/)
    assert.ok(query.bindings.includes('included'))
    assert.doesNotMatch(query.sql, /season_start|spotify_playlist_item|country_code_resolved/)
  }
  const ranking = rankedWorks(db, 3).toSQL()
  assert.match(ranking.sql, /order by "count" desc, "w"\."title" asc, "w"\."id" asc limit \?/)
  assert.deepEqual(ranking.bindings, ['included', 3, 20])
})
