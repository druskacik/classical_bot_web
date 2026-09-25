import '#nitro-internal-pollyfills'
import { useNitroApp } from 'nitropack/runtime'

// Nitro 2 does not await async plugin callbacks. Warm the same in-process
// cache used by requests before importing the module that opens the port.
useNitroApp()
const deadline = setTimeout(() => {
  console.error('[composer-recommendations] startup warm-up timed out after 30000ms')
  process.exit(1)
}, 30_000)

try {
  const { getComposerRecommendations } = await import('./utils/composer-recommendations.js')
  await getComposerRecommendations()
  clearTimeout(deadline)
} catch {
  console.error('[composer-recommendations] startup warm-up failed; HTTP listener not started')
  process.exit(1)
}

await import('nitropack/presets/node/runtime/node-server')
