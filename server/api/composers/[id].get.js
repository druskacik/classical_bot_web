import { getComposerDirectory, getComposerWorks } from '../../utils/composers.js'
import { composerIdFromSlug } from '#shared/utils/composers.js'
import { getComposerRecommendations } from '../../utils/composer-recommendations.js'
import { selectRelatedComposers } from '../../utils/composer-recommendation-cache.js'

export default defineEventHandler(async (event) => {
  const id = composerIdFromSlug(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Composer not found' })
  try {
    const directory = await getComposerDirectory()
    const composer = directory.find(item => item.id === id)
    if (!composer) throw createError({ statusCode: 404, statusMessage: 'Composer not found' })
    const [works, rankings] = await Promise.all([getComposerWorks(id), getComposerRecommendations()])
    return { ...composer, works,
      related: selectRelatedComposers(id, directory, rankings) }
  } catch (error) {
    if (error.statusCode === 404) throw error
    throw createError({ statusCode: 503, statusMessage: 'Composer could not be loaded' })
  }
})
