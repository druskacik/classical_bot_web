import '#nitro-internal-pollyfills'
import { useNitroApp } from 'nitropack/runtime'
import { useRuntimeConfig } from 'nitropack/runtime/config'
import { maintenanceEnabled } from './utils/maintenance.js'

// Start serving before warming optional recommendations. Database readiness is
// still enforced by data endpoints, not by an optional ranking aggregation.
useNitroApp()
await import('nitropack/presets/node/runtime/node-server')

if (!maintenanceEnabled(useRuntimeConfig().maintenanceMode)) {
  void import('./utils/composer-recommendations.js')
    .then(({ warmComposerRecommendations }) => warmComposerRecommendations())
    .catch(() => {
      console.error('[composer-recommendations] background warm-up unavailable; using fallback')
    })
}
