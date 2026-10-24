import knex from '../../../layers/concerts/server/utils/connection.js'
import { withServingSnapshot } from '../../../layers/concerts/server/utils/serving-catalogue.js'
import { createEntityApiHandler } from './entity-handler.js'
import { queryEntitySnapshot } from './query-entities.js'
import { businessApiLimiter } from './limiter.js'

export function entityRoute(kind) {
  return createEntityApiHandler({
    kind,
    limiter: businessApiLimiter,
    snapshot: load => withServingSnapshot(knex, load),
    load: (input, trx) => queryEntitySnapshot(trx, kind, input),
  })
}
