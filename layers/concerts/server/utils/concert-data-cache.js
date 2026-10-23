import knex from './connection.js'
import { withServingSnapshot } from './serving-catalogue.js'
import { concertSite } from '#concert-site'
import { createDataCache } from './data-cache.js'
import { siteDataCacheKey } from './data-cache-keys.js'

export const concertDataCache = createDataCache()
const lifetimes = {
  concerts: 120_000,
  'map-cities': 120_000,
  'area-cities': 300_000,
  'city-identities': 300_000,
  'filter-options': 120_000,
  countries: 300_000,
  sources: 300_000,
  composers: 300_000,
  'composer-directory': 300_000,
  'composer-works': 300_000,
  'composer-profile': 300_000,
  cities: 120_000,
}

export function cachedConcertData(namespace, input, loader) {
  if (!Object.hasOwn(lifetimes, namespace)) throw new Error('Unknown concert cache namespace')
  if (['area-cities', 'city-identities'].includes(namespace)) {
    return concertDataCache.get(namespace, siteDataCacheKey(concertSite, input), lifetimes[namespace], loader)
  }
  return withServingSnapshot(knex, (trx, publication) => concertDataCache.get(
    `serving-v1:${namespace}`, siteDataCacheKey(concertSite, { input, generation: publication.generation, currentDate: publication.currentDate }),
    lifetimes[namespace], () => loader(trx, publication),
  ))
}
