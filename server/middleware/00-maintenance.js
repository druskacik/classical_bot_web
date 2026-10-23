import { getRequestURL } from 'h3'
import { maintenanceEnabled, maintenanceResponse } from '../utils/maintenance.js'

// Nitro serves static assets before app middleware. Run before legacy redirects,
// API handlers and normal page rendering, all of which may query PostgreSQL.
// Page requests continue to the maintenance-only Vue route table.
export default defineEventHandler(event => {
  // Maintenance is a runtime concern; content prerendering must still build.
  if (import.meta.prerender) return
  // Serving the maintenance page is healthy; do not trigger container restarts.
  if (['GET', 'HEAD'].includes(event.method) && getRequestURL(event).pathname === '/api/health') return
  if (!maintenanceEnabled(useRuntimeConfig(event).maintenanceMode)) return
  return maintenanceResponse(event)
})
