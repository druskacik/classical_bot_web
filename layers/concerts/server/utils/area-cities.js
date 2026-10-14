import { buildCityIdentities } from '../../shared/utils/city-identity.js'
import { cityDisplayName, cityQueryValues } from '../../shared/utils/city-query.js'
import knex from './connection.js'
import { cachedConcertData } from './concert-data-cache.js'
import { validCoordinates } from '../../shared/utils/concert-area.js'
import { containsNormalizedText, normalizeSearchText } from './search-text.js'

export const getIdentityCities = () => cachedConcertData('city-identities', {}, () =>
  knex('city').select('id', 'english_name', 'local_name', 'display_name', 'country_code', 'latitude', 'longitude'))

export const getAreaCities = () => cachedConcertData('area-cities', {}, async () => {
  const cities = await getIdentityCities()
  const identities = buildCityIdentities(cities)
  const values = cityQueryValues(cities)
  return cities.filter(validCoordinates).map(city => ({ ...city, uniqueAliases: identities.uniqueAliases(city), cityQuery: values.get(String(city.id)) }))
})
export function areaCityOptions(cities, query, selected, locale, countryName) {
  const search = normalizeSearchText(query)
  const label = city => cityDisplayName(city, locale)
  const matches = cities.filter(city => !search || [city.english_name, city.local_name, city.display_name].some(name => containsNormalizedText(name, search)))
    .sort((a, b) => label(a).localeCompare(label(b), locale) || a.country_code.localeCompare(b.country_code) || Number(a.id) - Number(b.id)).slice(0, 20)
  const chosen = cities.find(city => String(city.id) === selected)
  if (chosen && !matches.includes(chosen)) matches.push(chosen)
  return matches.map(city => ({ value: String(city.id), cityQuery: city.cityQuery, label: label(city), secondaryLabel: countryName(city.country_code),
    englishName: city.english_name, localName: city.local_name, country_code: city.country_code, latitude: city.latitude, longitude: city.longitude }))
}
