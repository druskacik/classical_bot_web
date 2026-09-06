import { getComposerDirectory, getComposerWorks } from '../../utils/composers.js'
import { composerIdFromSlug } from '#shared/utils/composers.js'

export default defineEventHandler(async (event) => {
  const id = composerIdFromSlug(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Composer not found' })
  try {
    const directory = await getComposerDirectory()
    const composer = directory.find(item => item.id === id)
    if (!composer) throw createError({ statusCode: 404, statusMessage: 'Composer not found' })
    return { ...composer, works: await getComposerWorks(id),
      related: directory.filter(item => item.id !== id).slice(0, 3) }
  } catch (error) {
    if (error.statusCode === 404) throw error
    throw createError({ statusCode: 503, statusMessage: 'Composer could not be loaded' })
  }
})
