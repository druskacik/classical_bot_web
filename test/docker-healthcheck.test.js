import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

// Execute the actual Dockerfile probe, without needing a Docker daemon.
test('Docker healthcheck uses the runtime port and fails on errors, redirects and timeouts', async t => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')
  const instruction = dockerfile.match(/HEALTHCHECK --interval=5s --timeout=2s --start-period=20s --retries=3 \\\n\s*CMD (\[[^\n]+\])/)
  assert.ok(instruction, 'runtime image must declare the healthcheck')
  const [executable, ...args] = JSON.parse(instruction[1])
  assert.equal(executable, 'node')
  let status = 200, hang = false
  const server = createServer((request, response) => {
    assert.equal(request.url, '/api/health')
    if (hang) return
    response.writeHead(status, status === 302 ? { Location: '/api/health' } : {})
    response.end('{"status":"ok"}')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const port = String(server.address().port)
  const probe = async overrides => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, PORT: port, NITRO_PORT: '', ...overrides },
      stdio: 'ignore', timeout: 4000,
    })
    const [code] = await once(child, 'exit')
    return code
  }
  assert.equal(await probe(), 0)
  assert.equal(await probe({ PORT: '1', NITRO_PORT: port }), 0, 'Nitro port takes precedence')
  status = 503
  assert.equal(await probe(), 1)
  status = 302
  assert.equal(await probe(), 1, 'a redirect is not a healthy local listener')
  hang = true
  assert.equal(await probe(), 1, 'the probe has its own bounded HTTP timeout')
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  assert.equal(await probe(), 1, 'connection refusal fails the check')
})
