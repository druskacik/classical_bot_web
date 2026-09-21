import { normalizeAreaLocation, normalizeMapQuery } from '../utils/concert-discovery.js'
import { serializeConcertQuery } from '../../shared/utils/concert-query.js'
export default defineNuxtRouteMiddleware(to => {
  const query = to.path === '/map' ? normalizeMapQuery(to.query) : serializeConcertQuery(to.query)
  const target = normalizeAreaLocation(to.path, query)
  if (target) return navigateTo({ ...target, hash: to.hash }, { replace: true })
  if (JSON.stringify(query) !== JSON.stringify(to.query)) return navigateTo({ path: to.path, query, hash: to.hash }, { replace: true })
})
