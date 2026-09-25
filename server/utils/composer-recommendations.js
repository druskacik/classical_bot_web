import knex from '#layers/concerts/server/utils/connection.js'
import { queryComposerRecommendations } from './composer-recommendation-query.js'
import { createRecommendationCache } from './composer-recommendation-cache.js'

export const getComposerRecommendations = createRecommendationCache(
  defineCachedFunction, () => queryComposerRecommendations(knex),
)
