import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getConcertListSeoState,
} from '../layers/concerts/app/composables/useConcertListSeo.js'

test('indexes a clean homepage with an absolute canonical URL', () => {
  assert.deepEqual(
    getConcertListSeoState({ origin: 'https://classicalbot.com', canonicalPath: '/', query: {} }),
    {
      robots: 'index, follow',
      canonicalHref: 'https://classicalbot.com/',
    },
  )
})

test('indexes a clean country page with an absolute canonical URL', () => {
  assert.deepEqual(
    getConcertListSeoState({ origin: 'https://classicalbot.com', canonicalPath: '/czechia', query: {} }),
    {
      robots: 'index, follow',
      canonicalHref: 'https://classicalbot.com/czechia',
    },
  )
})

test('does not index subject, location, date, area, or unknown query URLs', () => {
  const queries = [
    { country: 'CZ' },
    { city: 'Prague,CZ' },
    { dateFrom: '2026-09-03' },
    { dateTo: '2026-09-30' },
    { composers: 'Wolfgang Amadeus Mozart' },
    { works: '1' },
    { radius: '25' },
    { bounds: '1,2,3,4' },
    { composers: 'Claude Debussy', page: '2', utm_source: 'test' },
    { unknown: '' },
  ]

  for (const query of queries) {
    assert.deepEqual(
      getConcertListSeoState({ origin: 'https://classicalbot.com', canonicalPath: '/', query }),
      {
        robots: 'noindex, follow',
        canonicalHref: null,
      },
    )
  }
})

test('canonical URLs use the consuming site origin without changing indexing policy', () => {
  assert.deepEqual(
    getConcertListSeoState({ origin: 'https://classical.sk', canonicalPath: '/Bratislava', query: {} }),
    { robots: 'index, follow', canonicalHref: 'https://classical.sk/Bratislava' },
  )
  assert.deepEqual(
    getConcertListSeoState({ origin: 'https://classical.sk', canonicalPath: '/Bratislava', query: { page: '2' } }),
    { robots: 'index, follow', canonicalHref: 'https://classical.sk/Bratislava?page=2' },
  )
  assert.throws(() => getConcertListSeoState({ canonicalPath: '/', query: {} }), TypeError)
})

test('pagination has a page-specific canonical, without tracking parameters', () => {
  for (const canonicalPath of ['/', '/czechia', '/czechia/prague']) {
    for (const page of ['1', '2', '003']) {
      const state = getConcertListSeoState({ origin: 'https://classicalbot.com', canonicalPath, query: { page, utm_source: 'newsletter', utm_campaign: 'autumn', gclid: '123' } })
      assert.deepEqual(state, {
        robots: 'index, follow',
        canonicalHref: `https://classicalbot.com${canonicalPath}${Number(page) > 1 ? `?page=${Number(page)}` : ''}`,
      })
    }
  }
})

test('tracking-only variants consolidate to the clean listing', () => {
  assert.deepEqual(getConcertListSeoState({ origin: 'https://classicalbot.com', canonicalPath: '/', query: { utm_medium: 'email', fbclid: 'abc' } }), {
    robots: 'index, follow', canonicalHref: 'https://classicalbot.com/',
  })
})

test('invalid pagination and unavailable or empty listings are not indexable', () => {
  for (const page of ['', null, '0', '-1', '2.5', 'bad', 'Infinity', '9007199254740992', ['2', '3']]) {
    assert.deepEqual(getConcertListSeoState({ origin: 'https://classicalbot.com', canonicalPath: '/', query: { page } }), {
      robots: 'noindex, follow', canonicalHref: null,
    })
  }
  assert.deepEqual(getConcertListSeoState({ origin: 'https://classicalbot.com', canonicalPath: '/', query: { page: '2', utm_source: 'test' }, indexable: false }), {
    robots: 'noindex, follow', canonicalHref: null,
  })
})
