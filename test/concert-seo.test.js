import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getConcertListSeoState,
} from '../app/composables/useConcertListSeo.js'

test('indexes a clean homepage with an absolute canonical URL', () => {
  assert.deepEqual(
    getConcertListSeoState({ canonicalPath: '/', query: {} }),
    {
      robots: 'index, follow',
      canonicalHref: 'https://classicalbot.com/',
    },
  )
})

test('indexes a clean country page with an absolute canonical URL', () => {
  assert.deepEqual(
    getConcertListSeoState({ canonicalPath: '/czechia', query: {} }),
    {
      robots: 'index, follow',
      canonicalHref: 'https://classicalbot.com/czechia',
    },
  )
})

test('does not index filter, pagination, tracking, or unknown query URLs', () => {
  const queries = [
    { country: 'CZ' },
    { city: 'Prague,CZ' },
    { dateFrom: '2026-09-03' },
    { dateTo: '2026-09-30' },
    { composers: 'Wolfgang Amadeus Mozart' },
    { works: '1' },
    { page: '2' },
    { utm_source: 'test' },
    { unknown: '' },
  ]

  for (const query of queries) {
    assert.deepEqual(
      getConcertListSeoState({ canonicalPath: '/', query }),
      {
        robots: 'noindex, follow',
        canonicalHref: null,
      },
    )
  }
})
