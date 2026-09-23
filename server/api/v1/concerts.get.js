import knex from '../../../layers/concerts/server/utils/connection.js'
import { createConcertApiHandler } from '../../utils/business-api/handler.js'
import { queryConcerts } from '../../utils/business-api/query-concerts.js'
export default createConcertApiHandler({ load: input => queryConcerts(knex, input) })
