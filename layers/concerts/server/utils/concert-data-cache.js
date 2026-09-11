import { concertSite } from '#concert-site'
import { createDataCache } from './data-cache.js'
import { siteDataCacheKey } from './data-cache-keys.js'

export const concertDataCache = createDataCache()
const lifetimes = {
  concerts: 120_000,
  'filter-options': 120_000,
  countries: 300_000,
  sources: 300_000,
  composers: 300_000,
  cities: 120_000,
}

export function cachedConcertData(namespace, input, loader) {
  if (!Object.hasOwn(lifetimes, namespace)) throw new Error('Unknown concert cache namespace')
  return concertDataCache.get(namespace, siteDataCacheKey(concertSite, input), lifetimes[namespace], loader)
}
