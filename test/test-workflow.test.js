import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { validateInventory } from '../agent_utils/run_tests.mjs'

// These guards prevent a green baseline from silently losing coverage.
test('test inventory rejects unclassified, duplicate, and deleted test files', () => {
  const inventory = { default: ['one.test.js'], integration: ['two.test.js'], startup: [] }
  validateInventory(['one.test.js', 'two.test.js'], inventory)
  assert.throws(() => validateInventory(['one.test.js', 'two.test.js', 'new.test.js'], inventory), /unclassified=new.test.js/)
  assert.throws(() => validateInventory(['one.test.js'], inventory), /missing files=two.test.js/)
  assert.throws(() => validateInventory(['one.test.js'], { default: ['one.test.js'], integration: ['one.test.js'] }), /duplicate=one.test.js/)
})

test('group runner rejects synthetic skipped, TODO, failed, and empty coverage', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cb-test-runner-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const runner = new URL('../agent_utils/run_tests.mjs', import.meta.url).href
  for (const [name, body, expected] of [
    ['pass', "test('example', () => {})", 0],
    ['skip', "test.skip('example', () => {})", 1],
    ['todo', "test.todo('example')", 1],
    ['fail', "test('example', () => { throw new Error('synthetic failure') })", 1],
    ['empty', '', 1],
  ]) {
    const file = join(directory, `${name}.test.mjs`)
    await writeFile(file, `import test from 'node:test'\n${body}\n`)
    const source = `import { runGroup } from ${JSON.stringify(runner)}; try { await runGroup('synthetic', [${JSON.stringify(file)}]) } catch (error) { console.error(error.message); process.exitCode = 1 }`
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT
    const entry = join(directory, 'run.mjs')
    await writeFile(entry, source)
    const result = spawnSync(process.execPath, [entry], { env, encoding: 'utf8', timeout: 15_000 })
    assert.equal(result.error, undefined)
    assert.equal(result.status, expected, `${name}: ${result.stdout}\n${result.stderr}`)
  }
})
