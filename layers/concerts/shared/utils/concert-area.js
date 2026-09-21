import { hasRadiusQuery } from './concert-query.js'
export const AREA_KEYS = ['nearLat', 'nearLng', 'radius']
export const hasAreaQuery = hasRadiusQuery
export const areaQuery = area => !area ? {} : area.cityId || area.origin
  ? { city: String(area.cityId || area.origin), radius: String(area.radiusKm) }
  : { nearLat: String(area.latitude), nearLng: String(area.longitude), radius: String(area.radiusKm) }
export const clearAreaQuery = () => ({ nearLat: undefined, nearLng: undefined, radius: undefined })

export function distanceKm(a, b) {
  const radians = degrees => degrees * Math.PI / 180
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude))
    * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))))
}
export const validCoordinates = point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
export const citiesWithinArea = (cities, area) => cities.filter(city => validCoordinates(city)
  && distanceKm(area, city) <= area.radiusKm + 1e-9).map(city => String(city.id))
