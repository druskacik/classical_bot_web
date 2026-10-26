// @ts-check
import { resolveConcertFilters } from '../resolve-concert-filters.js'
import { firstQueryValue as first, composerSelections, querySelections } from '../../../shared/utils/concert-query.js'
import { buildCityIdentities } from '../../../shared/utils/city-identity.js'
import { getIdentityCities } from '../area-cities.js'
import { normalizeSearchText } from '../search-text.js'
import { facetFilters, parseCity, parseConcertFilters } from '../concert-filters.js'
import { getCityCatalogue } from '../city-catalogue.js'

/** @param {Record<string, unknown>} query @param {import('./types').Site} concertSite
 * @returns {Promise<import('./types').PreparedRequest>} */
export async function prepareFilterOptions(query, concertSite) {
  /** @type {unknown} */
  const type = first(query.type)
  const includeUnavailable = first(query.includeUnavailable) === 'true'
  if (type !== 'country' && type !== 'city' && type !== 'composer' && type !== 'work') {
    throw createError({ statusCode: 400, statusMessage: 'Type must be country, city, composer, or work' })
  }
  const parsedFilters = parseConcertFilters(query, concertSite.country)
  // Retain the canonical-city parameter used by existing API callers.
  if (query.cityId !== undefined) {
    const id = first(query.cityId)
    if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) {
      throw createError({ statusCode: 400, statusMessage: 'City ID must be a positive integer' })
    }
    const city = (await getCityCatalogue()).byId.get(id)
    if (!city || (parsedFilters.country && parsedFilters.country !== city.countryCode)) {
      throw createError({ statusCode: 400, statusMessage: 'City must match the selected country' })
    }
    parsedFilters.country = city.countryCode
    if (!parsedFilters.city) parsedFilters.city = parseCity(id)
  }
  const identityCities = type === 'city' || parsedFilters.city ? await getIdentityCities() : []
  const identities = buildCityIdentities(identityCities)
  const filters = await resolveConcertFilters(parsedFilters, { identities })
  const context = facetFilters(filters, type)
  if (concertSite.country) context.country = concertSite.country
  const search = normalizeSearchText(String(first(query.q) || '').trim().slice(0, 100))
  const selectedText = String(first(query.selected) || '').trim()
  const selected = type === 'city' ? (selectedText ? [selectedText] : []) : type === 'composer' ? composerSelections(selectedText) : querySelections(selectedText)
  if (type === 'city') selected.forEach(value => parseCity(value))
  return { type, context, search, selected, includeUnavailable, identityCities, identities }
}
