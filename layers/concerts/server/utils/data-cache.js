// Data only: this cache does not change HTTP caching policy.
export const isDataCacheEnabled = (env = process.env) => {
  if (env.SERVER_DATA_CACHE_ENABLED === 'true') return true
  if (env.SERVER_DATA_CACHE_ENABLED === 'false') return false
  return env.NODE_ENV === 'production'
}

export function createDataCache({
  enabled = isDataCacheEnabled,
  now = () => performance.now(),
  maxEntries = 500,
  maxBytes = 16 * 1024 * 1024,
  maxEntryBytes = 1024 * 1024,
  maxPending = 100,
} = {}) {
  const entries = new Map()
  const pending = new Map()
  const counters = new Map()
  let bytes = 0
  const freshCounters = () => ({ hits: 0, misses: 0, shared: 0, loadFailures: 0, evictions: 0, bypasses: 0 })
  const statsFor = namespace => {
    if (!counters.has(namespace)) counters.set(namespace, freshCounters())
    return counters.get(namespace)
  }
  const remove = key => {
    const entry = entries.get(key)
    if (!entry) return
    bytes -= entry.bytes
    entries.delete(key)
  }
  const prune = () => {
    const time = now()
    for (const [key, entry] of entries) if (time >= entry.expiresAt) remove(key)
  }

  async function get(namespace, key, ttlMs, loader) {
    const stats = statsFor(namespace)
    const run = async () => {
      try { return await loader() }
      catch (error) { stats.loadFailures++; throw error }
    }
    if (!enabled()) {
      stats.bypasses++
      return run()
    }
    const identity = JSON.stringify([namespace, key])
    prune()
    const entry = entries.get(identity)
    if (entry) {
      stats.hits++
      entries.delete(identity)
      entries.set(identity, entry)
      return structuredClone(entry.value)
    }
    if (pending.has(identity)) {
      stats.shared++
      return structuredClone(await pending.get(identity))
    }
    if (pending.size >= maxPending || Buffer.byteLength(identity) > maxEntryBytes) {
      stats.bypasses++
      return run()
    }
    stats.misses++
    // Defer execution until the promise has been registered, including sync loaders.
    const operation = Promise.resolve().then(run).then(value => {
      const owned = structuredClone(value)
      const size = Buffer.byteLength(identity) + Buffer.byteLength(JSON.stringify(owned))
      if (size > maxEntryBytes || size > maxBytes || maxEntries < 1) {
        stats.bypasses++
        return owned
      }
      prune()
      while (entries.size >= maxEntries || bytes + size > maxBytes) {
        const oldest = entries.keys().next().value
        statsFor(entries.get(oldest).namespace).evictions++
        remove(oldest)
      }
      entries.set(identity, { namespace, value: owned, bytes: size, expiresAt: now() + ttlMs })
      bytes += size
      return owned
    })
    pending.set(identity, operation)
    try { return structuredClone(await operation) }
    finally { pending.delete(identity) }
  }

  function snapshot({ reset = false } = {}) {
    prune()
    const result = Object.fromEntries([...counters].map(([namespace, stats]) => [namespace, {
      ...stats, retainedEntries: 0, retainedBytes: 0,
    }]))
    for (const entry of entries.values()) {
      result[entry.namespace].retainedEntries++
      result[entry.namespace].retainedBytes += entry.bytes
    }
    // Reset in place so running loaders still report into the active counters.
    if (reset) for (const stats of counters.values()) Object.assign(stats, freshCounters())
    return result
  }
  return { get, snapshot }
}
