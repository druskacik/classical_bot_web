import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = 4173
const origin = `http://127.0.0.1:${port}`

function parseRoutePath(argv) {
  let routePath = '/'

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--path') {
      routePath = argv[index + 1]
      index += 1
    } else if (argument.startsWith('--path=')) {
      routePath = argument.slice('--path='.length)
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (!routePath || !routePath.startsWith('/')) {
    throw new Error('The Lighthouse path must start with "/".')
  }

  const targetUrl = new URL(routePath, origin)
  if (targetUrl.origin !== origin) {
    throw new Error('The Lighthouse path must stay on the local Nuxt origin.')
  }

  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      ...options,
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`
      reject(new Error(`${command} failed with ${reason}.`))
    })
  })
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      await run(candidate, ['--version'])
      return candidate
    } catch {
      // Try the next known Chrome or Chromium location.
    }
  }

  throw new Error('Chrome was not found. Set CHROME_PATH to a Chrome or Chromium executable.')
}

async function assertPortAvailable() {
  await new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Stop that process and retry.`))
        return
      }
      reject(error)
    })

    server.listen(port, '127.0.0.1', () => {
      server.close((error) => error ? reject(error) : resolve())
    })
  })
}

async function main() {
  const routePath = parseRoutePath(process.argv.slice(2))
  const chromePath = await findChrome()
  await assertPortAvailable()
  await rm(path.join(projectRoot, '.lighthouseci'), { recursive: true, force: true })
  await rm(path.join(projectRoot, 'lighthouse-reports'), { recursive: true, force: true })

  console.log(`\nBuilding the Nuxt production server for ${routePath}...\n`)
  await run('npm', ['run', 'build'])

  const lhciPath = path.join(projectRoot, 'node_modules', '.bin', 'lhci')
  await access(lhciPath, constants.X_OK)

  for (const profile of ['mobile', 'desktop']) {
    console.log(`\nRunning the ${profile} Lighthouse audit...\n`)
    await run(lhciPath, ['autorun'], {
      env: {
        ...process.env,
        CHROME_PATH: chromePath,
        LIGHTHOUSE_PATH: routePath,
        LIGHTHOUSE_PORT: String(port),
        LIGHTHOUSE_PROFILE: profile,
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(port),
      },
    })
  }

  console.log('\nLighthouse reports are ready:')
  console.log('  lighthouse-reports/mobile/')
  console.log('  lighthouse-reports/desktop/')
}

main().catch((error) => {
  console.error(`\nLighthouse workflow failed: ${error.message}`)
  process.exitCode = 1
})
