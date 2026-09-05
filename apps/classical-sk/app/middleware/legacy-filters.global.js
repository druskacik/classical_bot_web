// Keep old bookmarks functional, preserving every other filter and the city path.
export default defineNuxtRouteMiddleware(to => {
  if (to.query.skladatelia === undefined) return
  const { skladatelia, ...query } = to.query
  if (query.composers === undefined) query.composers = skladatelia
  return navigateTo({ path: to.path, query, hash: to.hash }, { redirectCode: 301, replace: true })
})
