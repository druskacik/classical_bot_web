import { getComposerDirectory } from '../../utils/composers.js'

export default defineEventHandler(async () => {
  try {
    return { items: await getComposerDirectory() }
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Composers could not be loaded' })
  }
})
