import { withQuery } from 'ufo'
import { withServingSnapshot } from '#layers/concerts/server/utils/serving-catalogue.js'
import knex from '#layers/concerts/server/utils/connection.js'
import { applyPublicConcertScope } from '#layers/concerts/server/utils/public-concerts.js'
import { getCityCatalogue } from '#layers/concerts/server/utils/city-catalogue.js'
import { legacyConcertLocation } from '#shared/utils/legacy-concert-location.js'

export default defineEventHandler(async event => {
  if (event.context.maintenance) return
  if (!['GET', 'HEAD'].includes(event.method) || getRequestURL(event).pathname !== '/') return
  const query = getQuery(event)
  if (typeof query.country !== 'string') return
  // Most requests, including all area searches, need no database work here.
  const candidate = legacyConcertLocation({ ...query, city: undefined })
  if (!candidate) return
  return withServingSnapshot(knex, async knex => {
  const catalogue = query.city === undefined ? null : await getCityCatalogue(knex)
  const target = legacyConcertLocation(query, catalogue)
  if (!target) return
  // Country routes exist only while the country has public upcoming concerts.
  const exists = await applyPublicConcertScope(knex('serving.current_concert as cc'), query.country.trim().toUpperCase())
    .select('cc.id').first()
  if (exists) return sendRedirect(event, withQuery(target.path, target.query), 301)
  })
})
