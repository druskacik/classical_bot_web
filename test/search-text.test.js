import assert from 'node:assert/strict'
import test from 'node:test'

import {
  containsNormalizedText,
  normalizedLikePattern,
  normalizeSearchText,
} from '../layers/concerts/server/utils/search-text.js'

test('normalizes accents, case, punctuation, and whitespace like catalogue text', () => {
  assert.equal(normalizeSearchText('  Thomas ADÈS  '), 'thomas ades')
  assert.equal(normalizeSearchText('Ružomberok'), 'ruzomberok')
  assert.equal(normalizeSearchText('Camille Saint-Saëns'), 'camille saint saens')
  assert.equal(normalizeSearchText('Straße'), 'strasse')
  assert.equal(normalizeSearchText(''), '')
})

test('matches normalized substrings in composed and decomposed text', () => {
  assert.equal(containsNormalizedText('Ružomberok', 'ruzom'), true)
  assert.equal(containsNormalizedText('Thomas Adès', 'ades'), true)
  assert.equal(containsNormalizedText('Thomas Ades', 'adès'), false)
})

test('escapes SQL LIKE metacharacters in normalized search text', () => {
  assert.equal(normalizedLikePattern('100%_done\\'), '%100\\%\\_done\\\\%')
})
