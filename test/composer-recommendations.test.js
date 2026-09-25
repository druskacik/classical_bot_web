import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, connect } from 'node:net'
import { once } from 'node:events'
import knex from 'knex'
import { queryComposerRecommendations } from '../server/utils/composer-recommendation-query.js'

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

test('source recommendations and production startup with isolated PostgreSQL', { timeout: 70_000 }, async t => {
  try { execFileSync('initdb', ['--version'], { stdio: 'ignore' }) } catch { t.skip('PostgreSQL initdb is required'); return }
  const dir = mkdtempSync(join(tmpdir(), 'composer-recommendations-pg-'))
  let running = false, db
  const children = []
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'exit')
        child.kill('SIGKILL')
        await closed
      }
    }
    await db?.destroy()
    if (running) execFileSync('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  })
  execFileSync('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' })
  execFileSync('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-h '' -k ${dir} -p 55443 -F`, '-w', 'start'], { stdio: 'ignore' })
  running = true
  db = knex({ client: 'pg', connection: { host: dir, port: 55443, database: 'postgres' }, pool: { min: 0, max: 3 } })
  await db.raw(`
    CREATE TABLE crawler_source(id bigint primary key, canonical_url text, duplicate_of_id bigint);
    CREATE TABLE crawler_source_url(crawler_source_id bigint, url text);
    CREATE TABLE composer(id int primary key, name text);
    CREATE TABLE composer_spotify_playlist(id int primary key, composer_id int, status text, is_public boolean,
      spotify_playlist_id text, season_start date, season_end date, last_synced_at timestamptz);
    CREATE TABLE composer_spotify_playlist_item(playlist_id int);
    CREATE TABLE classical_concert(id int primary key, source_url text, date date, inclusion_status text, duplicate_of_id int);
    CREATE TABLE classical_concert_composer(classical_concert_id int, composer_id int, UNIQUE(classical_concert_id, composer_id));
    CREATE TABLE work(id int primary key, title text, catalogue_number text, composer_id int);
    CREATE TABLE classical_concert_work(classical_concert_id int, work_id int);
    INSERT INTO crawler_source VALUES (1,'https://one.test/',NULL),(2,'https://old.test/',1),(3,'https://older.test/',2);
    INSERT INTO crawler_source_url VALUES (3,'https://alias.test/');
    INSERT INTO composer VALUES (1,'Target'),(2,'Alpha'),(3,'Beta'),(4,'No pair'),(5,'Hidden'),(6,'Alpha');
    INSERT INTO composer_spotify_playlist
      SELECT id,id,'published',id<>5,'1234567890123456789012','2026-07-01','2027-07-01',NULL FROM composer;
    INSERT INTO classical_concert VALUES
      (1,'https://one.test/',CURRENT_DATE,'included',NULL),
      (2,'https://old.test/',CURRENT_DATE+1,'included',NULL),
      (3,'https://alias.test',CURRENT_DATE+2,'included',NULL),
      (4,'https://two.test/',CURRENT_DATE,'included',NULL),
      (5,' https://two.test ',CURRENT_DATE+1,'included',NULL),
      (6,'https://one.test/',CURRENT_DATE,'included',NULL),
      (7,NULL,CURRENT_DATE,'included',NULL),
      (8,'https://past.test/',CURRENT_DATE-1,'included',NULL),
      (9,'https://excluded.test/',CURRENT_DATE,'excluded',NULL),
      (10,'https://duplicate.test/',CURRENT_DATE,'included',1),
      (11,' ',CURRENT_DATE,'included',NULL);
    INSERT INTO classical_concert_composer VALUES
      (1,1),(1,2),(1,3),(1,5),(1,6),
      (2,1),(2,2),(3,1),(3,2),
      (4,2),(5,2),(6,4),
      (7,1),(7,4),(8,1),(8,4),(9,1),(9,4),(10,1),(10,4),(11,1),(11,4);
  `)
  const before = await db.raw('SHOW jit')
  const rankings = await queryComposerRecommendations(db)
  assert.deepEqual(rankings[1], [
    { id: 6, sharedSources: 1, totalSources: 1, score: 1 },
    { id: 3, sharedSources: 1, totalSources: 1, score: 1 },
    { id: 2, sharedSources: 1, totalSources: 2, score: 0.5 },
  ])
  assert.equal(rankings[4], undefined, 'same source on different concerts does not create a pair')
  assert.equal(rankings[5], undefined, 'unpublished composers are ineligible')
  assert.deepEqual((await db.raw('SHOW jit')).rows, before.rows, 'JIT setting does not escape the transaction')
  const tie = await db.transaction()
  try {
    await tie('composer').insert({ id: 7, name: 'Alpha' })
    await tie('composer_spotify_playlist').insert({ id: 7, composer_id: 7, status: 'published', is_public: true, spotify_playlist_id: '1234567890123456789012' })
    await tie('classical_concert_composer').insert({ classical_concert_id: 1, composer_id: 7 })
    assert.deepEqual((await queryComposerRecommendations(tie))[1].map(c => c.id), [6, 7, 3, 2])
  } finally {
    await tie.rollback()
  }

  if (process.env.TEST_COMPOSER_STARTUP !== '1') return
  const launch = async (overrides = {}) => {
    const port = await unusedPort()
    const child = spawn(process.execPath, ['.output/server/index.mjs'], {
      env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
        NUXT_DB_HOST: dir, NUXT_DB_PORT: '55443', NUXT_DB_NAME: 'postgres',
        NUXT_DB_USER: process.env.USER, NUXT_DB_PASS: '', ...overrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    return { child, port, output: () => output }
  }
  const blocker = await db.transaction()
  try {
    await blocker.raw('LOCK composer_spotify_playlist IN ACCESS EXCLUSIVE MODE')
    const server = await launch()
    await until(async () => {
      assert.equal(server.child.exitCode, null, server.output())
      const { rows } = await db.raw("SELECT 1 FROM pg_stat_activity WHERE application_name='classical-bot-web' AND wait_event_type='Lock'")
      return rows.length > 0
    })
    assert.equal(await portOpen(server.port), false, 'listener must remain closed during warm-up')
    await blocker.rollback()
    await until(() => {
      assert.equal(server.child.exitCode, null, server.output())
      return portOpen(server.port)
    })
    const response = await fetch(`http://127.0.0.1:${server.port}/api/composers/1`)
    assert.equal(response.status, 200, server.output())
    const body = await response.json()
    assert.deepEqual(body.related.map(c => c.id), [6, 3, 2])
    assert.equal(body.related[0].name, 'Alpha')
    assert.equal((server.output().match(/\[composer-recommendations\] refreshed/g) || []).length, 1)
  } finally {
    if (!blocker.isCompleted()) await blocker.rollback()
  }
  const failed = await launch({ NUXT_DB_HOST: join(dir, 'missing-socket') })
  await until(() => failed.child.exitCode !== null)
  assert.equal(failed.child.exitCode, 1)
  assert.equal(await portOpen(failed.port), false)
  assert.match(failed.output(), /startup warm-up failed/)

  const timeoutBlocker = await db.transaction()
  try {
    await timeoutBlocker.raw('LOCK composer_spotify_playlist IN ACCESS EXCLUSIVE MODE')
    const timedOut = await launch()
    await until(() => timedOut.child.exitCode !== null, 20_000)
    assert.equal(timedOut.child.exitCode, 1, timedOut.output())
    assert.equal(await portOpen(timedOut.port), false)
    assert.match(timedOut.output(), /startup warm-up failed/)
  } finally {
    await timeoutBlocker.rollback()
  }

  // A connection that never completes must not bypass the overall startup
  // deadline (the SQL statement timeout has not started in this case).
  const sockets = new Set()
  const stalledDatabase = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  stalledDatabase.listen(0, '127.0.0.1')
  await once(stalledDatabase, 'listening')
  try {
    const stalled = await launch({ NUXT_DB_HOST: '127.0.0.1', NUXT_DB_PORT: String(stalledDatabase.address().port) })
    await until(() => stalled.child.exitCode !== null, 33_000)
    assert.equal(stalled.child.exitCode, 1)
    assert.equal(await portOpen(stalled.port), false)
    assert.match(stalled.output(), /startup warm-up timed out after 30000ms/)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => stalledDatabase.close(resolve))
  }
})
