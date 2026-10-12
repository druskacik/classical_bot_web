import { cityDisplayName } from '../../shared/utils/city-query.js'

// Resolve the selection itself, independently of concert counts and pagination.
export async function resolveConcertDisplayCity(db, city, locale = 'en-GB') {
  if (!city) return null
  const rows = await db('city').select('id', 'english_name', 'local_name', 'display_name', 'country_code')
    .modify(query => {
      if (city.id) query.where('id', city.id)
      else {
        query.where(inner => inner.whereRaw('LOWER(english_name) = ?', [city.name.toLowerCase()])
          .orWhereRaw('LOWER(local_name) = ?', [city.name.toLowerCase()]))
        if (city.country) query.where('country_code', city.country)
      }
    }).limit(2)
  const resolved = rows.length === 1 ? rows[0] : null
  return {
    label: resolved ? cityDisplayName(resolved, locale) : city.name,
    countryCode: resolved?.country_code || city.country || null,
  }
}
