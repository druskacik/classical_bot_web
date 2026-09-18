export const AREA_KEYS = ['nearCity', 'nearLat', 'nearLng', 'radiusKm']
export const hasAreaQuery = query => AREA_KEYS.some(key => query[key] !== undefined && query[key] !== null)
export const areaQuery = area => !area ? {} : area.cityId
  ? { nearCity: String(area.cityId), radiusKm: String(area.radiusKm) }
  : { nearLat: String(area.latitude), nearLng: String(area.longitude), radiusKm: String(area.radiusKm) }
export const clearAreaQuery = () => Object.fromEntries(AREA_KEYS.map(key => [key, undefined]))

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
