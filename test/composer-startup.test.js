import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, connect } from 'node:net'
import { once } from 'node:events'
import { createTestDatabase } from '../test-support/postgres.js'
import { seedComposers } from '../test-support/composer-fixture.js'
import { publishResolvedFixture } from '../test-support/resolved-fixture.js'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function unusedPort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function portOpen(port) {
  return new Promise(resolve => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
}
async function until(check, timeout = 10_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) return
    await pause(30)
  }
  throw new Error('Timed out waiting for test server')
}

test('recommendation production startup with isolated PostgreSQL', { timeout: 70_000 }, async t => {
  const { db, directory, connection, trackChild } = await createTestDatabase(t)
  await seedComposers(db)
  const launch = async (overrides = {}) => {
    const port = await unusedPort()
    const child = spawn(process.execPath, [fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url))], {
      cwd: directory,
      env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
        NITRO_PORT: '', NUXT_MAINTENANCE_MODE: 'false', NUXT_PUBLIC_ALERTS_ENABLED: 'false',
        NUXT_DB_HOST: connection.host, NUXT_DB_PORT: String(connection.port), NUXT_DB_NAME: connection.database,
        NUXT_DB_USER: connection.user, NUXT_DB_PASS: '', ...overrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    trackChild(child)
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    return { child, port, output: () => output }
  }
  const request = (server, path) => fetch(`http://127.0.0.1:${server.port}${path}`, { signal: AbortSignal.timeout(3000) })
  const listening = server => until(() => {
    assert.equal(server.child.exitCode, null, server.output())
    return portOpen(server.port)
  })
  const blocker = await db.transaction()
  try {
    // Block only recommendations, not the directory/works needed by profiles.
    await blocker.raw('LOCK crawler_source IN ACCESS EXCLUSIVE MODE')
    const server = await launch()
    await listening(server)
    await until(async () => {
      const { rows } = await db.raw("SELECT 1 FROM pg_stat_activity WHERE application_name='classical-bot-web' AND wait_event_type='Lock'")
      return rows.length > 0
    })
    assert.equal((await request(server, '/favicon.svg')).status, 200)
    const concerts = await request(server, '/api/get-concerts')
    assert.equal(concerts.status, 200, server.output())
    assert.ok((await concerts.json()).total > 0)
    const fallback = await request(server, '/api/composers/1')
    assert.equal(fallback.status, 200, server.output())
    assert.deepEqual((await fallback.json()).related.map(c => c.id), [2, 4, 6])
    const missing = await request(server, '/api/composers/9999')
    assert.equal(missing.status, 404)

    await blocker.rollback()
    await until(() => server.output().includes('[composer-recommendations] refreshed'))
    // The base profile is now a cache hit. It must not retain cached fallback.
    const response = await request(server, '/api/composers/1')
    assert.equal(response.status, 200, server.output())
    const body = await response.json()
    assert.deepEqual(body.related.map(c => c.id), [6, 3, 4])
    assert.equal(body.related[0].name, 'Alpha')
    assert.equal((server.output().match(/\[composer-recommendations\] refreshed/g) || []).length, 1)
  } finally {
    if (!blocker.isCompleted()) await blocker.rollback()
  }

  const failed = await launch({ NUXT_DB_HOST: join(directory, 'missing-socket') })
  await listening(failed)
  await until(() => failed.output().includes('[composer-recommendations] refresh failed'))
  assert.equal((await request(failed, '/favicon.svg')).status, 200)
  assert.equal((await request(failed, '/api/composers/1')).status, 503, 'essential data still fails closed')
  assert.equal(failed.child.exitCode, null)

  const timeoutBlocker = await db.transaction()
  try {
    await timeoutBlocker.raw('LOCK crawler_source IN ACCESS EXCLUSIVE MODE')
    const timedOut = await launch()
    await listening(timedOut)
    const loading = await request(timedOut, '/api/composers/1')
    assert.equal(loading.status, 200)
    assert.deepEqual((await loading.json()).related.map(c => c.id), [2, 4, 6])
    await until(() => timedOut.output().includes('[composer-recommendations] refresh failed'), 20_000)
    assert.equal(timedOut.child.exitCode, null, timedOut.output())
    for (let i = 0; i < 3; i++) {
      const response = await request(timedOut, '/api/composers/1')
      assert.equal(response.status, 200)
      assert.deepEqual((await response.json()).related.map(c => c.id), [2, 4, 6])
    }
    assert.equal((timedOut.output().match(/\[composer-recommendations\] refresh failed/g) || []).length, 1)
    const { rows } = await db.raw("SELECT 1 FROM pg_stat_activity WHERE application_name='classical-bot-web' AND wait_event_type='Lock'")
    assert.equal(rows.length, 0, 'fallback requests do not launch more queries during backoff')
  } finally {
    await timeoutBlocker.rollback()
  }

  await db('serving.state').update({ active_generation: null })
  const unpublished = await launch()
  await listening(unpublished)
  assert.equal((await request(unpublished, '/favicon.svg')).status, 200)
  assert.equal((await request(unpublished, '/api/composers/1')).status, 503)
  assert.equal(unpublished.child.exitCode, null)
  await publishResolvedFixture(db)

  // Even a database connection that never completes cannot block HTTP startup.
  const sockets = new Set()
  const stalledDatabase = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  stalledDatabase.listen(0, '127.0.0.1')
  await once(stalledDatabase, 'listening')
  try {
    const stalled = await launch({ NUXT_DB_HOST: '127.0.0.1', NUXT_DB_PORT: String(stalledDatabase.address().port) })
    await listening(stalled)
    await until(() => sockets.size > 0)
    assert.equal((await request(stalled, '/favicon.svg')).status, 200)
    assert.equal(stalled.child.exitCode, null)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => stalledDatabase.close(resolve))
  }
})
