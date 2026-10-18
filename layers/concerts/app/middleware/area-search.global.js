import { normalizeAreaLocation, normalizeMapQuery } from '../utils/concert-discovery.js'
import { serializeConcertQuery } from '../../shared/utils/concert-query.js'
export default defineNuxtRouteMiddleware(to => {
  // Preserve the requested URL and 503 status on the maintenance-only route.
  if (to.meta?.maintenance === true) return
  const query = to.path === '/map' ? normalizeMapQuery(to.query) : serializeConcertQuery(to.query)
  const target = normalizeAreaLocation(to.path, query)
  if (target) return navigateTo({ ...target, hash: to.hash }, { replace: true })
  if (JSON.stringify(query) !== JSON.stringify(to.query)) return navigateTo({ path: to.path, query, hash: to.hash }, { replace: true })
})
