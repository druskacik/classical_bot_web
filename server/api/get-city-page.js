import { getCityCatalogue } from '../utils/city-catalogue.js'

export default defineEventHandler(async event => {
  const { country, city } = getQuery(event)
  if (typeof country !== 'string' || typeof city !== 'string') {
    throw createError({ statusCode: 404, statusMessage: 'City not found' })
  }
  const identity = (await getCityCatalogue()).byPath.get(`/${country}/${city}`)
  if (!identity) throw createError({ statusCode: 404, statusMessage: 'City not found' })
  return identity
})
