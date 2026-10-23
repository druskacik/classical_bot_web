export const recommendationCacheOptions = {
  maxAgeMs: 86400_000,
  retryDelayMs: 60_000,
}

// Optional, in-process rankings. Reads never wait for database work. Keep one
// successful publication and one in-flight load, rather than queueing refreshes
// for every visitor. Retries are demand-driven and rate-limited after failures.
export function createRecommendationCache(load, {
  now = Date.now,
  maxAgeMs = recommendationCacheOptions.maxAgeMs,
  retryDelayMs = recommendationCacheOptions.retryDelayMs,
  logger = console,
} = {}) {
  let snapshot
  let expiresAt = 0
  let retryAt = 0
  let pending

  function warm() {
    if (pending) return pending
    if (now() < retryAt) return Promise.resolve()
    const started = performance.now()
    // Register the promise before calling load, including synchronous failures.
    pending = Promise.resolve().then(load).then(result => {
      snapshot = result
      expiresAt = now() + maxAgeMs
      retryAt = 0
      logger.info(`[composer-recommendations] refreshed ${Object.keys(result.rankings).length} composers in ${Math.round(performance.now() - started)}ms`)
    }).catch(() => {
      retryAt = now() + retryDelayMs
      // Never log SQL/connection details or cache failure as successful emptiness.
      logger.error(`[composer-recommendations] refresh failed after ${Math.round(performance.now() - started)}ms; using fallback, retry allowed in ${retryDelayMs}ms`)
    }).finally(() => { pending = undefined })
    return pending
  }

  function get(publishedAt) {
    if (!publishedAt) return {}
    const matches = snapshot?.publishedAt === publishedAt
    // An older request snapshot must not cause a backwards refresh or use newer
    // rankings. Publication keys are the canonical ISO timestamps from readiness.
    const older = snapshot && publishedAt < snapshot.publishedAt
    if (!older && (!matches || now() >= expiresAt)) void warm()
    // Same-publication stale rankings are safe during refresh/failure. For a new
    // publication, use the current directory fallback until its rankings arrive.
    return matches ? snapshot.rankings : {}
  }

  return { get, warm }
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
