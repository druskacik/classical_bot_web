import { firstQueryValue, hasCoordinateQuery } from '../../shared/utils/concert-query.js'
import { subjectMatchesQuery, subjectMetadata } from '../../shared/utils/subject-discovery.js'
import { getCountryName } from './countries.js'

export const concertLocationKey = query => JSON.stringify(
  ['country', 'city', 'radius', 'nearLat', 'nearLng', 'bounds'].map(key => firstQueryValue(query?.[key]) ?? null),
)

export const matchingDisplaySubject = (query, subject) => subjectMatchesQuery(subject, query) ? subject : null

export function concertLocationPhrase(query, { city = null, area = null } = {}) {
  if (query.bounds) return 'in the map area'
  if (hasCoordinateQuery(query)) return 'in the selected area'
  if (Number(query.radius) > 0) return area?.label
    ? `within ${Number(query.radius)} km of ${area.label}` : 'in the selected area'
  if (query.city) {
    // Raw readable names remain useful before resolution; numeric IDs never do.
    const raw = String(query.city).trim()
    const match = raw.match(/^(.*),\s*([a-z]{2})$/i)
    const label = city?.label || (/^\d+$/.test(raw) ? null : (match?.[1].trim() || raw))
    if (!label) return 'in the selected city'
    const country = city?.countryCode || match?.[2] || query.country
    return `in ${label}${country ? `, ${getCountryName(country)}` : ''}`
  }
  return query.country ? `in ${getCountryName(query.country)}` : ''
}

export function concertListPresentation(query, { subject = null, city = null, area = null } = {}) {
  const selected = matchingDisplaySubject(query, subject)
  const location = concertLocationPhrase(query, { city, area })
  const metadata = selected ? subjectMetadata(selected, location || 'worldwide') : null
  const heading = selected ? subjectMetadata(selected, location).heading.trim()
    : `Classical music concerts${location ? ` ${location}` : ''}`
  return {
    heading,
    title: metadata?.title || `Classical music concerts ${location || 'worldwide'} — ClassicalBot`,
    description: metadata?.description,
    profilePath: selected?.type === 'composer' ? selected.profilePath || null : null,
    profileLabel: selected?.type === 'composer' ? `${selected.name}’s playlist and repertoire` : null,
  }
}
