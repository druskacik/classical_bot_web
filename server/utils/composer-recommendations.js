import knex from '#layers/concerts/server/utils/connection.js'
import { withResolvedSnapshot } from '#layers/concerts/server/utils/resolved-concerts.js'
import { queryComposerRecommendationSnapshot } from './composer-recommendation-query.js'
import { createRecommendationCache } from './composer-recommendation-cache.js'

// Background work always owns its snapshot. Never borrow a request transaction:
// the request should finish while this aggregation is still running.
const recommendations = createRecommendationCache(() => withResolvedSnapshot(knex, async (trx, publication) => ({
  publishedAt: publication.publishedAt,
  rankings: await queryComposerRecommendationSnapshot(trx),
})))

export const getComposerRecommendations = publishedAt => recommendations.get(publishedAt)
export const warmComposerRecommendations = () => recommendations.warm()
