import { normalizeAreaLocation } from '../utils/concert-discovery.js'
export default defineNuxtRouteMiddleware(to => {
  const target = normalizeAreaLocation(to.path, to.query)
  if (target) return navigateTo(target, { replace: true })
})
