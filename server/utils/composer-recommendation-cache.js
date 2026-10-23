export const recommendationCacheOptions = {
  name: 'composer-recommendations-resolved-v1',
  maxAge: 86400,
  swr: false,
  getKey: publishedAt => publishedAt || 'all',
}

export function createRecommendationCache(cache, load, logger = console) {
  return cache(async (...args) => {
    const started = performance.now()
    try {
      const rankings = await load(...args)
      logger.info(`[composer-recommendations] refreshed ${Object.keys(rankings).length} composers in ${Math.round(performance.now() - started)}ms`)
      return rankings
    } catch {
      // Never turn a failed refresh into a successful empty cache entry.
      // Do not log connection details or the SQL embedded in database errors.
      logger.error(`[composer-recommendations] refresh failed after ${Math.round(performance.now() - started)}ms`)
      throw new Error('Composer recommendations unavailable')
    }
  }, recommendationCacheOptions)
}

export function selectRelatedComposers(id, directory, rankings) {
  const byId = new Map(directory.map(composer => [composer.id, composer]))
  const seen = new Set([id])
  const related = []
  for (const candidateId of [
    ...(rankings[id] || []).map(candidate => candidate.id),
    ...directory.map(composer => composer.id),
  ]) {
    if (seen.has(candidateId) || !byId.has(candidateId)) continue
    seen.add(candidateId)
    related.push(byId.get(candidateId))
    if (related.length === 3) break
  }
  return related
}
