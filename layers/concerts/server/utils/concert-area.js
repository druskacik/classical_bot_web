import { createError } from 'h3'
import { normalizeConcertQuery, hasCoordinateQuery } from '../../shared/utils/concert-query.js'
import { citiesWithinArea } from '../../shared/utils/concert-area.js'

const invalid = message => { throw createError({ statusCode: 400, statusMessage: message }) }
const number = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Number(value))) invalid(`${label} must be a finite number`)
  return Number(value)
}
export function parseArea(input) {
  const query = normalizeConcertQuery(input)
  const coordinates = hasCoordinateQuery(query)
  if (query.radius === undefined && !coordinates) return null
  const radiusKm = number(query.radius, 'Radius')
  if (!Number.isInteger(radiusKm) || radiusKm < (coordinates ? 1 : 0) || radiusKm > 500) invalid('Radius must be a whole number from ' + (coordinates ? 1 : 0) + ' to 500 km')
  if (coordinates) {
    if (query.city || query.country || query.cityId) invalid('Area cannot be combined with exact city or country filters')
    const latitude = number(query.nearLat, 'Latitude')
    const longitude = number(query.nearLng, 'Longitude')
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) invalid('Coordinates are outside valid ranges')
    return { latitude, longitude, radiusKm }
  }
  if (!radiusKm) return null
  if (typeof query.city !== 'string' || !query.city.trim() || query.city.length > 160) invalid('Choose a city before setting a radius')
  if (query.country || query.cityId) invalid('Radius cannot be combined with a country or cityId filter')
  const origin = query.city.trim()
  if (/^\d+$/.test(origin) && (!Number.isSafeInteger(Number(origin)) || Number(origin) < 1)) invalid('City ID must be a positive integer')
  return { origin, radiusKm }
}
export function matchingAreaCities(cities, origin) {
  const separator = origin.lastIndexOf(',')
  const name = (separator < 0 ? origin : origin.slice(0, separator)).toLowerCase()
  const country = separator < 0 ? null : origin.slice(separator + 1).toUpperCase()
  return cities.filter(item => /^\d+$/.test(origin) ? String(item.id) === origin
    : (!country || item.country_code === country) && [item.english_name, item.local_name].some(value => value?.toLowerCase() === name))
}
export function resolveArea(area, cities, locale = 'en-GB') {
  if (!area) return null
  let city = area.cityId ? cities.find(city => String(city.id) === area.cityId) : null
  if (area.origin) {
    const matches = matchingAreaCities(cities, area.origin)
    if (matches.length !== 1) invalid('City coordinates are unavailable or ambiguous; choose another city')
    city = matches[0]
  }
  if (area.cityId && !city) invalid('City coordinates are unavailable; choose another city or point')
  const resolved = city ? { ...area, cityId: String(city.id), latitude: city.latitude, longitude: city.longitude,
    label: locale === 'sk-SK' ? city.local_name || city.english_name : city.english_name,
    countryCode: city.country_code,
    unresolvedCity: {
      names: [...new Set([city.english_name, city.local_name].filter(Boolean).map(name => name.toLowerCase()))].sort(),
      countryCode: city.country_code,
    } } : { ...area, label: null }
  return { ...resolved, cityIds: citiesWithinArea(cities, resolved) }
}
export const publicArea = area => {
  if (!area) return null
  const { cityIds, unresolvedCity, ...metadata } = area
  return metadata
}
