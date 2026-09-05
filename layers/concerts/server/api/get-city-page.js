import { concertSite } from '#concert-site'
import { getCityCatalogue } from '../utils/city-catalogue.js'

export default defineEventHandler(async event => {
  const { country, city, path } = getQuery(event)
  if (concertSite.cityRoutes === 'local' ? typeof path !== 'string' : typeof country !== 'string' || typeof city !== 'string') {
    throw createError({ statusCode: 404, statusMessage: 'City not found' })
  }
  const identity = (await getCityCatalogue()).byPath.get(concertSite.cityRoutes === 'local' ? path : `/${country}/${city}`)
  if (!identity) throw createError({ statusCode: 404, statusMessage: 'City not found' })
  return identity
})
