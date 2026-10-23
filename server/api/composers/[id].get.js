import { cachedConcertData } from '#layers/concerts/server/utils/concert-data-cache.js'
import { getComposerDirectory, getComposerWorks } from '../../utils/composers.js'
import { composerIdFromSlug } from '#shared/utils/composers.js'
import { getComposerRecommendations } from '../../utils/composer-recommendations.js'
import { selectRelatedComposers } from '../../utils/composer-recommendation-cache.js'

export default defineEventHandler(async (event) => {
  const id = composerIdFromSlug(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Composer not found' })
  try {
    const { composer, works, directory, publishedAt } = await cachedConcertData('composer-profile', { id }, async (trx, publication) => {
      const directory = await getComposerDirectory(trx)
      const composer = directory.find(item => item.id === id)
      if (!composer) throw createError({ statusCode: 404, statusMessage: 'Composer not found' })
      const works = await getComposerWorks(id, trx)
      return { composer, works, directory, publishedAt: publication.publishedAt }
    })
    // Do not cache the fallback in the profile response: a completed background
    // refresh should improve the very next request, even on a profile cache hit.
    const rankings = getComposerRecommendations(publishedAt)
    return { ...composer, works, related: selectRelatedComposers(id, directory, rankings) }
  } catch (error) {
    if (error.statusCode === 404) throw error
    throw createError({ statusCode: 503, statusMessage: 'Composer could not be loaded' })
  }
})
