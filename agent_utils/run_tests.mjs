import { readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { inspect } from 'node:util'
import { run } from 'node:test'
import { requirePostgres } from '../test-support/postgres.js'

const root = fileURLToPath(new URL('../', import.meta.url))
export const groups = JSON.parse(readFileSync(new URL('../test-support/test-groups.json', import.meta.url), 'utf8'))

export function validateInventory(discovered, inventory = groups) {
  const assigned = Object.values(inventory).flat()
  const duplicates = assigned.filter((file, index) => assigned.indexOf(file) !== index)
  const missing = discovered.filter(file => !assigned.includes(file))
  const obsolete = assigned.filter(file => !discovered.includes(file))
  if (duplicates.length || missing.length || obsolete.length) {
    throw new Error(`Test inventory mismatch: unclassified=${missing.join(', ') || 'none'}; duplicate=${duplicates.join(', ') || 'none'}; missing files=${obsolete.join(', ') || 'none'}. Update test-support/test-groups.json.`)
  }
}

// Structured events preserve individual diagnostics and catch skips without parsing TAP.
// https://nodejs.org/docs/latest-v24.x/api/test.html#class-testsstream
export async function runGroup(name, files, output = console) {
  if (!files.length) throw new Error(`[${name}] No test files selected`)
  let summary, rejected = false
  const completedFiles = new Set()
  const stream = run({ files, concurrency: 4, timeout: 120_000 })
  for await (const { type, data } of stream) {
    if (type === 'test:stdout' || type === 'test:stderr') output.log(data.message.trimEnd())
    if (type === 'test:pass' || type === 'test:fail') {
      const incomplete = data.skip || data.todo
      if (type === 'test:fail' || incomplete) rejected = true
      output.log(`${type === 'test:fail' ? 'FAIL' : incomplete ? 'SKIP/TODO' : 'PASS'} ${data.name}`)
      if (type === 'test:fail') output.error(inspect(data.details.error, { depth: 6, colors: false }))
    }
    if (type === 'test:summary') {
      if (data.file && data.counts.tests > 0) completedFiles.add(resolve(data.file))
      else if (!data.file) summary = data
    }
  }
  const emptyFiles = files.filter(file => !completedFiles.has(resolve(file)))
  if (emptyFiles.length) throw new Error(`[${name}] Test files did not report executed coverage: ${emptyFiles.join(', ')}`)
  if (!summary) throw new Error(`[${name}] No test summary received`)
  const { passed, failed, cancelled, skipped, todo, tests } = summary.counts
  output.log(`[${name}] ${tests} tests: ${passed} passed, ${failed} failed, ${cancelled} cancelled, ${skipped} skipped, ${todo} todo`)
  if (!tests || !summary.success || failed || cancelled || skipped || todo || rejected) {
    throw new Error(`[${name}] Required test coverage did not complete successfully; skips and TODOs are not allowed.`)
  }
}

export async function main(group = process.argv[2]) {
  if (!Object.hasOwn(groups, group)) throw new Error(`Choose a test group: ${Object.keys(groups).join(', ')}`)
  const entries = await readdir(resolve(root, 'test'), { recursive: true })
  validateInventory(entries.filter(file => /\.(?:test|spec)\.[cm]?[jt]s$/.test(file)).sort())
  if (group !== 'default') requirePostgres()
  await runGroup(group, groups[group].map(file => resolve(root, 'test', file)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
