import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createApp, toNodeListener } from 'h3'
import { parseInput, fail } from '../server/utils/business-api/contract.js'
import { parseEntityInput } from '../server/utils/business-api/query-entities.js'
import { createEntityApiHandler } from '../server/utils/business-api/entity-handler.js'
import { createConcertApiHandler } from '../server/utils/business-api/handler.js'
import { createDataCache } from '../layers/concerts/server/utils/data-cache.js'
import { createLimiter } from '../server/utils/business-api/limiter.js'

async function serve(t, handler) {
  const server = createServer(toNodeListener(createApp().use(handler)))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)) })
  return `http://127.0.0.1:${server.address().port}`
}

test('concert filter validation preserves bigint IDs and rejects missing/ambiguous inputs', () => {
  assert.equal(parseInput({ performer_id: '9007199254740993' }).performer_id, '9007199254740993')
  assert.equal(parseInput({ country_code: 'cz' }).country_code, 'CZ')
  for (const query of [{}, { format: 'csv' }, { country_code: '' }, { country_code: 'CZE' }, { country_code: ['CZ', 'DE'] },
    { city_id: ['1', '2'] }, { city_id: '0' }, { venue_id: '-1' }, { performer_id: '1.5' }, { city_id: '01' }, { city_id: '1e3' },
    { venue_id: '9223372036854775808' }, { performer_id: '9'.repeat(1000) }, { city_id: '1', url: '' }]) {
    assert.throws(() => parseInput(query), { statusCode: 400 })
  }
})

test('entity input is bounded and entity-specific', () => {
  assert.equal(parseEntityInput('cities', { q: '  Praha  ', country_code: 'cz' }).q, 'Praha')
  for (const kind of ['cities', 'performers', 'venues']) {
    const parsed = parseEntityInput(kind, { q: 'music' })
    assert.equal(parsed.pageSize, 20)
    assert.equal(parsed.has_upcoming, false)
    for (const query of [{}, { q: '' }, { q: ' ' }, { q: '!!!' }, { q: 'a'.repeat(201) }, { q: ['a', 'b'] },
      { q: 'a', format: 'csv' }, { q: 'a', url: 'example.com' }, { q: 'a', all: 'true' },
      { q: 'a', page: '0' }, { q: 'a', page_size: '101' }, { q: 'a', has_upcoming: 'yes' }]) {
      assert.throws(() => parseEntityInput(kind, query), { statusCode: 400 })
    }
  }
  assert.throws(() => parseEntityInput('performers', { q: 'a', country_code: 'CZ' }), { statusCode: 400 })
  assert.throws(() => parseEntityInput('cities', { q: 'a', city_id: '1' }), { statusCode: 400 })
})

test('non-URL requests bypass onboarding and preserve every filter in cache keys and next links', async t => {
  let calls = 0, preparations = 0
  const seen = []
  const base = await serve(t, createConcertApiHandler({
    env: {}, log: () => {}, cache: createDataCache({ enabled: () => true }),
    prepare: async () => { preparations++; return { id: '1', status: 'active', next_attempt_at: null } },
    load: async input => {
      calls++; seen.push(input)
      return { source: input.url ? { id: '1', name: 'Source', url: input.url } : null, concerts: [],
        pagination: { page: input.page, page_size: input.pageSize, total: 2, total_pages: 2, all: false }, generated_at: new Date().toISOString() }
    },
  }))
  const filters = 'city_id=1&venue_id=2&performer_id=3&country_code=cz&page_size=1'
  let response = await fetch(`${base}/?${filters}`)
  const body = await response.json()
  assert.equal(body.source, null)
  assert.equal(response.headers.get('x-source-status'), null)
  const next = new URL(body.pagination.next, base)
  for (const [key, value] of Object.entries({ city_id: '1', venue_id: '2', performer_id: '3', country_code: 'CZ', page: '2', page_size: '1', format: 'json' })) {
    assert.equal(next.searchParams.get(key), value)
  }
  assert.equal(next.searchParams.has('url'), false)
  response = await fetch(`${base}/?${filters}&format=csv`)
  assert.match(response.headers.get('content-type'), /text\/csv/)
  assert.match(response.headers.get('link'), /format=csv/)
  assert.equal(calls, 1)
  for (const [key, value] of [['city_id', '10'], ['venue_id', '20'], ['performer_id', '30'], ['country_code', 'de']]) {
    const params = new URLSearchParams(filters); params.set(key, value)
    assert.equal((await fetch(`${base}/?${params}`)).status, 200)
  }
  assert.equal(calls, 5, 'every filter partitions the cache')
  assert.equal(preparations, 0)
  response = await fetch(`${base}/?${filters}&url=example.com`)
  assert.equal((await response.json()).source.id, '1')
  assert.equal(preparations, 1)
  assert.equal(seen.at(-1).url, 'https://example.com/')
})

test('lookup HTTP endpoints provide JSON, pagination, cache isolation, CORS and safe errors', async t => {
  for (const kind of ['cities', 'performers', 'venues']) await t.test(kind, async t => {
    let calls = 0
    const base = await serve(t, createEntityApiHandler({
      kind, env: {}, log: () => {}, cache: createDataCache({ enabled: () => true }),
      load: async input => {
        calls++
        if (input.q === 'broken') throw new Error('private SQL details')
        if (input.q === 'unavailable') throw Object.assign(new Error('private catalogue'), { statusCode: 503 })
        if (input.q === 'limited') throw fail(429, 'rate_limited', 'Too many requests.', { retry_after: 5 })
        return { items: input.q === 'empty' ? [] : [{ id: '1', name: 'Match' }],
          pagination: { page: input.page, page_size: input.pageSize, total: input.q === 'empty' ? 0 : 2, total_pages: input.q === 'empty' ? 0 : 2, next: null }, generated_at: new Date().toISOString() }
      },
    }))
    const filters = `q=music&has_upcoming=true&page_size=1${kind !== 'performers' ? '&country_code=cz' : ''}${kind === 'venues' ? '&city_id=1' : ''}`
    const response = await fetch(`${base}/?${filters}`)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.equal(response.headers.get('x-total-count'), '2')
    const body = await response.json()
    const next = new URL(body.pagination.next, base)
    assert.equal(next.pathname, `/api/v1/${kind}`)
    assert.equal(next.searchParams.get('page'), '2')
    assert.equal(next.searchParams.get('q'), 'music')
    assert.equal(next.searchParams.get('has_upcoming'), 'true')
    if (kind !== 'performers') assert.equal(next.searchParams.get('country_code'), 'CZ')
    if (kind === 'venues') assert.equal(next.searchParams.get('city_id'), '1')
    await fetch(`${base}/?${filters}`)
    assert.equal(calls, 1)
    await fetch(`${base}/?${filters.replace('true', 'false')}`)
    assert.equal(calls, 2)
    for (const [q, status, code] of [['broken', 500, 'internal_error'], ['unavailable', 503, 'catalogue_unavailable'], ['limited', 429, 'rate_limited']]) {
      const errorResponse = await fetch(`${base}/?q=${q}`)
      assert.equal(errorResponse.status, status)
      const error = await errorResponse.json()
      assert.equal(error.error.code, code)
      assert.doesNotMatch(JSON.stringify(error), /private/)
      if (status !== 500) assert.ok(errorResponse.headers.get('retry-after'))
    }
    assert.deepEqual((await (await fetch(`${base}/?q=empty`)).json()).items, [])
    assert.equal((await fetch(`${base}/?q=a&q=b`)).status, 400)
    assert.equal((await fetch(base, { method: 'OPTIONS' })).status, 204)
  })
})

test('a shared limiter bounds lookup and concert requests together', async t => {
  const limiter = createLimiter()
  const lookup = await serve(t, createEntityApiHandler({ kind: 'cities', limiter, log: () => {}, env: {}, load: async () => ({ items: [], pagination: { total: 0, total_pages: 0 } }) }))
  const concerts = await serve(t, createConcertApiHandler({ limiter, log: () => {}, env: {}, load: async () => assert.fail('rate-limited load ran') }))
  for (let i = 0; i < 60; i++) assert.equal((await fetch(`${lookup}/?q=prague`)).status, 200)
  assert.equal((await fetch(`${concerts}/?city_id=1`)).status, 429)
})

test('both handler families preserve HTTP boundaries, error logs and proxy trust', async t => {
  for (const family of ['concerts', 'cities']) await t.test(family, async t => {
    const concert = family === 'concerts'
    const logs = [], attempts = []
    let loads = 0, failure
    const env = {}
    const base = await serve(t, (concert ? createConcertApiHandler : createEntityApiHandler)({
      kind: family, env, log: line => logs.push(JSON.parse(line)),
      cache: createDataCache({ enabled: () => false }),
      limiter: { attempt: (...args) => attempts.push(args), reserve() {}, release() {} },
      load: async input => {
        loads++
        if (failure) throw failure
        return { [concert ? 'concerts' : 'items']: [], pagination: { total: 2, total_pages: 2, page: input.page } }
      },
    }))
    const query = concert ? 'city_id=1' : 'q=music'
    const preflight = await fetch(`${base}/?invalid=query`, { method: 'OPTIONS' })
    assert.equal(preflight.status, 204)
    assert.equal(await preflight.text(), '')
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, OPTIONS')
    assert.equal(preflight.headers.get('access-control-expose-headers'), concert
      ? 'X-Total-Count, Link, Content-Disposition, Retry-After, X-Source-Status' : 'X-Total-Count, Link, Retry-After')
    assert.equal(preflight.headers.get('cache-control'), 'no-store')
    assert.deepEqual([loads, attempts.length, logs.length], [0, 0, 0])
    const invalid = await fetch(base)
    assert.equal(invalid.status, 400)
    assert.equal(logs.at(-1).status, 400)
    assert.deepEqual([loads, attempts.length], [0, 0], 'validation precedes limiting')
    for (const hops of [undefined, '1']) {
      env.BUSINESS_API_TRUST_PROXY_HOPS = hops
      const response = await fetch(`${base}/?${query}`, { headers: { 'x-forwarded-for': '198.51.100.10, 203.0.113.20' } })
      const body = await response.json()
      assert.equal(response.headers.get('link'), `<${body.pagination.next}>; rel="next"`)
      assert.equal(response.headers.get('x-total-count'), '2')
      assert.equal(attempts.at(-1)[0], hops ? '203.0.113.20' : '127.0.0.1')
      assert.equal(attempts.at(-1)[1], false)
    }
    for (const suffix of ['&page=2', ...(concert ? ['&all=true'] : [])]) {
      const response = await fetch(`${base}/?${query}${suffix}`)
      assert.equal(response.headers.get('link'), null)
      assert.equal((await response.json()).pagination.next, null)
    }
    for (const [error, status, expected, retry] of [
      [new Error('private database information'), 500, { code: 'internal_error', message: concert ? 'Unable to retrieve concerts.' : 'Unable to search entities.' }, null],
      [Object.assign(new Error('private catalogue'), { statusCode: 503 }), 503, { code: 'catalogue_unavailable', message: 'Concert catalogue temporarily unavailable.' }, '60'],
      [fail(429, 'rate_limited', 'Too many requests.', { retry_after: 5 }), 429, { code: 'rate_limited', message: 'Too many requests.', details: { retry_after: 5 } }, '5'],
      [fail(429, 'rate_limited', 'Too many requests.'), 429, { code: 'rate_limited', message: 'Too many requests.' }, '60'],
      [fail(404, 'not_found', 'No match.', { id: '1' }), 404, { code: 'not_found', message: 'No match.', details: { id: '1' } }, null],
    ]) {
      failure = error
      const response = await fetch(`${base}/?${query}${concert ? '&format=csv' : ''}`)
      assert.equal(response.status, status)
      assert.match(response.headers.get('content-type'), /application\/json/)
      assert.equal(response.headers.get('retry-after'), retry)
      assert.deepEqual(await response.json(), { error: expected })
      const entry = logs.at(-1)
      assert.equal(entry.status, status)
      assert.equal(entry.endpoint, `business-${family}`)
      assert.equal(entry.count, 0)
      assert.equal(Number.isInteger(entry.duration_ms), true)
      if (concert) assert.equal(entry.format, 'csv')
    }
  })
})
