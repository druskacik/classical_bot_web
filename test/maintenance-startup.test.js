import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { readdir } from 'node:fs/promises'

test('production maintenance works without PostgreSQL; normal startup still requires it', {
  skip: process.env.TEST_MAINTENANCE_STARTUP !== '1', timeout: 20_000,
}, async t => {
  let databaseConnections = 0
  const database = createServer(socket => { databaseConnections++; socket.destroy() })
  database.listen(0, '127.0.0.1')
  await once(database, 'listening')
  t.after(() => new Promise(resolve => database.close(resolve)))

  async function launch(flag) {
    const reservation = createServer()
    reservation.listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const port = reservation.address().port
    await new Promise(resolve => reservation.close(resolve))
    const child = spawn(process.execPath, ['.output/server/index.mjs'], {
      env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
        NUXT_MAINTENANCE_MODE: flag, NUXT_PUBLIC_ALERTS_ENABLED: 'true',
        NUXT_DB_HOST: '127.0.0.1', NUXT_DB_PORT: String(database.address().port),
        NUXT_DB_NAME: 'maintenance_test', NUXT_DB_USER: 'maintenance_test', NUXT_DB_PASS: '',
      }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill('SIGTERM')
        await exited
      }
    })
    return { child, origin: `http://127.0.0.1:${port}`, output: () => output }
  }

  const maintenance = await launch('true')
  const deadline = Date.now() + 8_000
  let ready = false
  while (Date.now() < deadline) {
    assert.equal(maintenance.child.exitCode, null, maintenance.output())
    try {
      const response = await fetch(maintenance.origin)
      assert.equal(response.status, 503)
      ready = true
      break
    } catch { await new Promise(resolve => setTimeout(resolve, 50)) }
  }
  assert.ok(ready, `Maintenance listener did not start: ${maintenance.output()}`)
  for (const path of [
    '/?country=SK&city=Bratislava', '/about', '/unknown-page', '/composers/beethoven',
    '/countries/SK?city=Bratislava,SK&radius=50',
    '/map?city=123&radius=50&page=1',
    '/?composers=%20Bach%2C%20Bach%20&page=1',
  ]) {
    const response = await fetch(maintenance.origin + path, { redirect: 'manual' })
    assert.equal(response.status, 503, path)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('location'), null)
    const html = await response.text()
    assert.match(html, /id="__nuxt"/, 'Maintenance must render through Vue SSR')
    assert.match(html, /We’ll be back soon/)
    assert.match(html, /maintenance-mode/, 'Hydration must preserve the maintenance route table')
  }
  for (const path of ['/sitemap.xml', '/api/get-concerts', '/__nuxt_content/blog/query']) {
    assert.equal((await fetch(maintenance.origin + path)).status, 503)
  }
  assert.equal((await fetch(maintenance.origin + '/favicon.svg')).status, 200)
  const files = await readdir('.output/public/_nuxt', { recursive: true })
  const asset = files.find(file => file.endsWith('.css'))
  assert.ok(asset, 'Build must contain a CSS asset')
  assert.equal((await fetch(maintenance.origin + '/_nuxt/' + asset)).status, 200)
  assert.equal((await fetch(maintenance.origin + '/composers/missing-image.webp')).status, 503)
  assert.equal(databaseConnections, 0, 'Maintenance must never connect to PostgreSQL')
  assert.doesNotMatch(maintenance.output(), /startup warm-up|\[composer-recommendations\] refreshed/)

  const normal = await launch('false')
  await once(normal.child, 'exit')
  assert.equal(normal.child.exitCode, 1, normal.output())
  assert.match(normal.output(), /startup warm-up failed/)
  assert.ok(databaseConnections > 0, 'Normal startup still performs database warm-up')
})
