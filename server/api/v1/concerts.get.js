import knex from '../../../layers/concerts/server/utils/connection.js'
import { createConcertApiHandler } from '../../utils/business-api/handler.js'
import { queryConcerts } from '../../utils/business-api/query-concerts.js'
import { createSourceOnboarding } from '../../utils/business-api/onboarding.js'
export default createConcertApiHandler({ prepare: createSourceOnboarding(knex), load: input => queryConcerts(knex, input) })
