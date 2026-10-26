import { concertSite } from '#concert-site'
import { buildCityIdentities, resolveCitySelection } from '../../shared/utils/city-identity.js'
import { getAreaCities, getIdentityCities } from './area-cities.js'
import { resolveArea } from './concert-area.js'

// Callers parse first and may reuse catalogues already needed for their response.
export async function resolveConcertFilters(parsedFilters, { identities, areaCities } = {}) {
  const filters = { ...parsedFilters }
  if (filters.city) {
    filters.city = resolveCitySelection(filters.city, identities ?? buildCityIdentities(await getIdentityCities()))
  }
  if (filters.area) {
    filters.area = resolveArea(filters.area, areaCities ?? await getAreaCities(), concertSite.locale)
  }
  return filters
}
