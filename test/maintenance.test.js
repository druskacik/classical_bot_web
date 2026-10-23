import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { maintenanceEnabled } from '../server/utils/maintenance.js'

test('maintenance flag accepts only explicit true', () => {
  for (const value of [true, 'true']) assert.equal(maintenanceEnabled(value), true)
  for (const value of [false, 'false', undefined, null, '', 'TRUE', '1', 1, {}, []]) {
    assert.equal(maintenanceEnabled(value), false)
  }
})

test('maintenance middleware and alert task stop before database work', async t => {
  const previous = Object.fromEntries(['defineEventHandler', 'useRuntimeConfig', 'defineTask'].map(key => [key, globalThis[key]]))
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  })
  let enabled = true
  globalThis.defineEventHandler = defineEventHandler
  globalThis.useRuntimeConfig = () => ({ maintenanceMode: enabled })
  globalThis.defineTask = task => task
  const { default: middleware } = await import('../server/middleware/00-maintenance.js')
  const { default: health } = await import('../server/api/health.get.js')
  let pageRenders = 0, normalCalls = 0
  const app = createApp().use(middleware).use('/api/health', health).use(defineEventHandler(event => {
    if (event.context.maintenance) {
      pageRenders++
      return 'Vue maintenance page'
    }
    normalCalls++
    return 'Normal route'
  }))
  const request = (path, method = 'GET') => toWebHandler(app)(new Request(`http://localhost${path}`, { method }))
  for (const path of ['/', '/?country=SK&city=Bratislava', '/about', '/unknown-page']) {
    const response = await request(path)
    assert.equal(response.status, 503, path)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('location'), null)
    assert.equal(await response.text(), 'Vue maintenance page')
  }
  assert.equal(pageRenders, 4)
  for (const path of ['/sitemap.xml', '/__sitemap__/nuxt-content-urls.json', '/__nuxt_content/blog/query']) {
    const response = await request(path)
    assert.equal(response.status, 503)
    assert.match(response.headers.get('content-type'), /text\/plain/)
    assert.match(await response.text(), /scheduled maintenance/)
  }
  assert.equal(pageRenders, 4, 'Dynamic endpoints must stop before page rendering')
  for (const [path, method] of [['/api', 'GET'], ['/api/get-concerts', 'GET'], ['/api/contact', 'POST'], ['/api/v1/concerts', 'OPTIONS'], ['/api/health', 'POST'], ['/api/health/other', 'GET']]) {
    const response = await request(path, method)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match(response.headers.get('content-type'), /application\/json/)
    assert.equal((await response.json()).statusCode, 503)
  }
  for (const path of ['/', '/api/get-concerts']) {
    const response = await request(path, 'HEAD')
    assert.equal(response.status, 503)
    assert.equal(await response.text(), '')
  }
  assert.equal(normalCalls, 0)

  const { default: db } = await import('../layers/concerts/server/utils/connection.js')
  const runner = db.client.runner
  db.client.runner = () => { throw new Error('Database must not be accessed during maintenance') }
  t.after(async () => { db.client.runner = runner; await db.destroy() })
  const { default: alerts } = await import('../server/tasks/concert-alerts.js')
  assert.deepEqual(await alerts.run(), { result: { maintenance: true } })

  for (const maintenance of [true, false]) {
    enabled = maintenance
    for (const path of ['/api/health', '/api/health?probe=1']) {
      const response = await request(path)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.deepEqual(await response.json(), { status: 'ok' })
    }
    const head = await request('/api/health', 'HEAD')
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
  }
  assert.equal(normalCalls, 0, 'health does not execute normal page handlers')

  enabled = false
  const response = await request('/')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Normal route')
  assert.equal(response.headers.get('cache-control'), null)
  assert.equal(normalCalls, 1)
})
