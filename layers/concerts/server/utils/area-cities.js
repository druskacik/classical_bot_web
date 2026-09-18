import knex from './connection.js'
import { cachedConcertData } from './concert-data-cache.js'
import { validCoordinates } from '../../shared/utils/concert-area.js'
import { containsNormalizedText, normalizeSearchText } from './search-text.js'

export const getAreaCities = () => cachedConcertData('area-cities', {}, async () => {
  const cities = await knex('city').select('id', 'english_name', 'local_name', 'country_code', 'latitude', 'longitude')
  return cities.filter(validCoordinates)
})
export function areaCityOptions(cities, query, selected, locale, countryName) {
  const search = normalizeSearchText(query)
  const label = city => locale === 'sk-SK' ? city.local_name || city.english_name : city.english_name
  const matches = cities.filter(city => !search || containsNormalizedText(city.english_name, search) || containsNormalizedText(city.local_name, search))
    .sort((a, b) => label(a).localeCompare(label(b), locale) || a.country_code.localeCompare(b.country_code) || Number(a.id) - Number(b.id)).slice(0, 20)
  const chosen = cities.find(city => String(city.id) === selected)
  if (chosen && !matches.includes(chosen)) matches.push(chosen)
  return matches.map(city => ({ value: String(city.id), label: label(city), secondaryLabel: countryName(city.country_code),
    englishName: city.english_name, localName: city.local_name, country_code: city.country_code, latitude: city.latitude, longitude: city.longitude }))
}
