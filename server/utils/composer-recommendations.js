import knex from '#layers/concerts/server/utils/connection.js'
import { withResolvedSnapshot } from '#layers/concerts/server/utils/resolved-concerts.js'
import { queryComposerRecommendationSnapshot } from './composer-recommendation-query.js'
import { createRecommendationCache } from './composer-recommendation-cache.js'

const cachedRecommendations = createRecommendationCache(
  defineCachedFunction, (_publishedAt, trx) => queryComposerRecommendationSnapshot(trx),
)
export const getComposerRecommendations = (db, publication) => db
  ? cachedRecommendations(publication.publishedAt, db)
  : withResolvedSnapshot(knex, (trx, publication) => cachedRecommendations(publication.publishedAt, trx))
