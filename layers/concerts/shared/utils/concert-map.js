export function parseMapBounds(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) throw new Error('Map bounds must be west,south,east,north')
  const [west, south, east, north] = value.split(',').map(Number)
  if (Math.abs(west) > 180 || Math.abs(east) > 180 || south < -90 || north > 90 || south >= north || west === east) throw new Error('Map bounds are outside valid ranges')
  return { west, south, east, north }
}
export const serializeMapBounds = bounds => [bounds.west, bounds.south, bounds.east, bounds.north].map(value => Number(value.toFixed(5))).join(',')
export const withinMapBounds = (city, bounds) => !bounds || (city.latitude >= bounds.south && city.latitude <= bounds.north
  && (bounds.west <= bounds.east ? city.longitude >= bounds.west && city.longitude <= bounds.east : city.longitude >= bounds.west || city.longitude <= bounds.east))
// Fixed projected cells keep marker counts bounded and stable while panning.
export function clusterMapCities(cities, project, cellSize = 64) {
  const cells = new Map()
  for (const city of cities) {
    const point = project(city)
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`
    let group = cells.get(key)
    if (!group) { group = { cities: [], count: 0, latitude: 0, longitude: 0, longitudeSin: 0, longitudeCos: 0 }; cells.set(key, group) }
    group.cities.push(city)
    group.count += city.count
    group.latitude += city.latitude
    group.longitudeSin += Math.sin(city.longitude * Math.PI / 180)
    group.longitudeCos += Math.cos(city.longitude * Math.PI / 180)
  }
  return [...cells.values()].map(group => ({ ...group, latitude: group.latitude / group.cities.length, longitude: Math.atan2(group.longitudeSin, group.longitudeCos) * 180 / Math.PI }))
}

export const nearestMapLongitude = (longitude, centre) => longitude + 360 * Math.round((centre - longitude) / 360)
