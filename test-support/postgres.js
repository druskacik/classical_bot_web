import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import knex from 'knex'

export function requirePostgres() {
  for (const command of ['initdb', 'pg_ctl']) {
    try { execFileSync(command, ['--version'], { stdio: 'pipe' }) }
    catch { throw new Error(`Tests require PostgreSQL: install it and add its bin directory to PATH (${command} is unavailable). Run npm test for checks without PostgreSQL.`) }
  }
}

// Each suite owns this cluster, including its schemas. Never accepts a DSN or .env.
export async function createTestDatabase(t) {
  requirePostgres()
  const directory = mkdtempSync(join(tmpdir(), 'cb-test-pg-'))
  const data = join(directory, 'data')
  const log = join(directory, 'postgres.log')
  const connection = { host: directory, port: 5432, user: 'test_user', database: 'postgres', options: '-c timezone=UTC' }
  const children = new Set()
  let db, closing
  // Ignore ambient libpq settings, including PGSERVICE/PGOPTIONS.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')))
  const command = (name, args) => execFileSync(name, args, { env, stdio: 'pipe', timeout: 30_000 })
  const cleanup = () => closing ||= (async () => {
    try {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit')
          child.kill('SIGKILL')
          await exited
        }
      }
    } finally {
      try { await db?.destroy() }
      finally {
        try {
          if (existsSync(join(data, 'postmaster.pid'))) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
        } finally {
          // Do not delete a live cluster if shutdown failed.
          if (!existsSync(join(data, 'postmaster.pid'))) rmSync(directory, { recursive: true, force: true })
        }
      }
    }
  })()
  const signals = new Map([['SIGINT', 130], ['SIGTERM', 143]].map(([signal, exitCode]) => [signal, () => {
    void cleanup().then(() => process.exit(exitCode), error => { console.error(error); process.exit(1) })
  }]))
  for (const [signal, handler] of signals) process.once(signal, handler)
  t.after(async () => {
    try { await cleanup() }
    finally { for (const [signal, handler] of signals) process.off(signal, handler) }
  })
  try {
    command('initdb', ['-D', data, '-U', connection.user, '-A', 'trust', '--no-locale', '-E', 'UTF8'])
    // Unique socket directories isolate concurrent runs even with the same port.
    command('pg_ctl', ['-D', data, '-l', log, '-o', `-h '' -k ${directory} -p 5432 -F -c timezone=UTC`, '-w', 'start'])
    db = knex({ client: 'pg', connection, pool: { min: 0, max: 3 } })
    await db.raw('SELECT 1')
    return { db, connection, directory, trackChild: child => { children.add(child); return child } }
  } catch (error) {
    const details = [error.message, error.stdout?.toString(), error.stderr?.toString(), existsSync(log) ? readFileSync(log, 'utf8') : ''].filter(Boolean).join('\n')
    throw new Error(`Disposable PostgreSQL initialization failed:\n${details}`, { cause: error })
  }
}
