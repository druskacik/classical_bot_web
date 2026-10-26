import { spawn } from 'node:child_process'
import { mkdirSync, createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
mkdirSync(new URL('../logs/check/', import.meta.url), { recursive: true })
for (const script of ['test', 'test:integration', 'typecheck', 'typecheck:sk', 'build:sk', 'test:startup']) {
  const log = createWriteStream(new URL(`../logs/check/${script.replaceAll(':', '-')}.log`, import.meta.url))
  console.log(`\n[check] ${script}`)
  const child = spawn('npm', ['run', script], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
  const stop = signal => child.kill(signal)
  const interrupt = () => stop('SIGINT')
  const terminate = () => stop('SIGTERM')
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', terminate)
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { process.stdout.write(chunk); log.write(chunk) })
  let code, signal
  try { [code, signal] = await once(child, 'close') }
  finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
    log.end()
    await once(log, 'finish')
  }
  if (code !== 0) {
    console.error(`[check] ${script} failed (${signal || code}); see logs/check/`)
    process.exitCode = 1
    break
  }
}
