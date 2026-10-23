import knex from '../../../layers/concerts/server/utils/connection.js'
import { createConcertApiHandler } from '../../utils/business-api/handler.js'
import { withResolvedSnapshot } from '#layers/concerts/server/utils/resolved-concerts.js'
import { queryConcertSnapshot } from '../../utils/business-api/query-concerts.js'
import { createSourceOnboarding } from '../../utils/business-api/onboarding.js'
export default createConcertApiHandler({
  prepare: createSourceOnboarding(knex),
  snapshot: load => withResolvedSnapshot(knex, load),
  load: (input, trx) => queryConcertSnapshot(trx, input),
})
