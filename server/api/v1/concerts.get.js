import knex from '../../../layers/concerts/server/utils/connection.js'
import { createConcertApiHandler } from '../../utils/business-api/handler.js'
import { withServingSnapshot } from '#layers/concerts/server/utils/serving-catalogue.js'
import { queryConcertSnapshot } from '../../utils/business-api/query-concerts.js'
import { createSourceOnboarding } from '../../utils/business-api/onboarding.js'
import { businessApiLimiter } from '../../utils/business-api/limiter.js'
export default createConcertApiHandler({
  limiter: businessApiLimiter,
  prepare: createSourceOnboarding(knex),
  snapshot: load => withServingSnapshot(knex, load),
  load: (input, trx, source) => queryConcertSnapshot(trx, input, source),
})
