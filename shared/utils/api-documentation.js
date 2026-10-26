import specification from '../../docs/openapi.json' with { type: 'json' }

export { specification }
export function resolveSchema(value) {
  if (!value?.$ref) return value
  if (!value.$ref.startsWith('#/')) throw new Error('Only local schema references are supported')
  const resolved = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], specification)
  if (!resolved) throw new Error(`Missing schema: ${value.$ref}`)
  return resolveSchema(resolved)
}
export function schemaType(value) {
  const schema = resolveSchema(value)
  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type || 'object'
  return type === 'array' ? `${schemaType(schema.items)}[]` : type
}
export function schemaNotes(value, includeDescription = true) {
  const schema = resolveSchema(value)
  return [includeDescription && schema.description, schema.enum && `Values: ${schema.enum.join(', ')}.`,
    schema.default !== undefined && `Default: ${schema.default}.`,
  ].filter(Boolean).join(' ')
}
export const endpoints = [
  { id: 'concerts', title: 'Concerts', schema: 'ConcertResponse', query: 'country_code=CZ&page_size=2', description: 'Find upcoming concerts. Use at least one filter; results must match all supplied filters.' },
  { id: 'cities', title: 'Find cities', schema: 'CityResponse', query: 'q=prague&country_code=CZ', description: 'Search cities by name. Use the returned ID as city_id.' },
  { id: 'performers', title: 'Find performers', schema: 'PerformerResponse', query: 'q=mozart&has_upcoming=true', description: 'Search performers by name. Use the returned ID as performer_id.' },
  { id: 'venues', title: 'Find venues', schema: 'VenueResponse', query: 'q=hall&country_code=GB', description: 'Search venues by name. Use the returned ID as venue_id.' },
].map(endpoint => ({ ...endpoint, path: `/api/v1/${endpoint.id}`, parameters: specification.paths[`/api/v1/${endpoint.id}`].get.parameters.map(resolveSchema) }))
