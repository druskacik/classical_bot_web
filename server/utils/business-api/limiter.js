import { fail } from './contract.js'
export function createLimiter(now = Date.now) {
  const clients = new Map()
  let exports = 0
  return {
    attempt(ip, all) {
      const time = now()
      for (const [key, bucket] of clients) if (bucket.expires <= time) clients.delete(key)
      const bucket = clients.get(ip) || { requests: 0, exports: 0, expires: time + 60000 }
      if (bucket.requests >= 60 || (all && bucket.exports >= 5) || (!clients.has(ip) && clients.size >= 10000)) {
        throw fail(429, 'rate_limited', 'Too many requests.', { retry_after: Math.max(1, Math.ceil((bucket.expires - time) / 1000)) })
      }
      bucket.requests++
      if (all) bucket.exports++
      clients.set(ip, bucket)
    },
    reserve() {
      if (exports >= 2) throw fail(429, 'rate_limited', 'Too many simultaneous exports.', { retry_after: 5 })
      exports++
    },
    release() { exports = Math.max(0, exports - 1) },
  }
}
