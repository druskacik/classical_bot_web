import test from 'node:test'
import assert from 'node:assert/strict'
import { mapProgramme } from '../layers/concerts/app/utils/map-programme.js'
const bach = { id: 1, name: 'Bach' }
const mozart = { id: 2, name: 'Mozart' }
const work = (id, composer) => ({ id, title: `Work ${id}`, composer })
test('short map previews retain composer/work associations and represent each composer before extra works', () => {
  const preview = mapProgramme([bach, mozart], [work(1, bach), work(2, bach), work(3, bach), work(4, mozart)])
  assert.deepEqual(preview.rows, [{ composer: 'Bach', work: 'Work 1' }, { composer: 'Mozart', work: 'Work 4' }, { composer: 'Bach', work: 'Work 2' }])
  assert.equal(preview.omitted, 1)
})
test('three composers retain work rows; four or more use composer names only, including work-derived identities', () => {
  const composers = [bach, mozart, { id: 3, name: 'Beethoven' }, { id: 4, name: 'Haydn' }]
  assert.equal(mapProgramme(composers.slice(0, 3), composers.slice(0, 3).map(c => work(c.id, c))).rows.length, 3)
  const preview = mapProgramme([bach], composers.map(c => work(c.id, c)))
  assert.deepEqual(preview.names, composers.map(c => c.name))
  assert.deepEqual(preview.rows, [])
})
test('unknown work authors are not attributed to listed composers; empty and composer-only data remain usable', () => {
  assert.deepEqual(mapProgramme([bach, mozart], []).names, ['Bach', 'Mozart'])
  assert.deepEqual(mapProgramme([], []), { names: [], rows: [], omitted: 0 })
  assert.deepEqual(mapProgramme([bach], [work(1, null)]).rows, [{ composer: 'Bach', work: '' }, { composer: '', work: 'Work 1' }])
})
