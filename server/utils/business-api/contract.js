export const fields = [
  'artists', 'date', 'time', 'venue_name', 'city', 'state', 'country', 'venue_address', 'buy_url',
  'id', 'title', 'event_url', 'end_time', 'event_status', 'last_verified_at',
  'country_code', 'city_id', 'venue_id', 'venue_url', 'parent_venue_name', 'latitude', 'longitude',
  'programme', 'programme_items', 'composers', 'performers', 'prices', 'price_items',
  'admission_type', 'booking_kind', 'booking_status', 'on_sale_at',
  'source_id', 'source_name', 'source_url', 'source_event_urls',
]
export function fail(statusCode, code, message, details) {
  return Object.assign(new Error(message), { statusCode, code, details })
}
export function normalizeUrl(input) {
  try {
    const value = input.trim()
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error()
    url.protocol = 'https:'
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    if (['80', '443'].includes(url.port)) url.port = ''
    url.hash = ''
    return url.href
  } catch { throw fail(400, 'invalid_url', 'Supply an HTTP(S) organisation website URL.') }
}
export const concertFilterNames = ['url', 'country_code', 'city_id', 'performer_id', 'venue_id']
export function parseId(value, name) {
  if (value === undefined) return undefined
  if (!/^[1-9]\d{0,18}$/.test(value) || (value.length === 19 && value > '9223372036854775807')) {
    throw fail(400, 'invalid_parameter', `${name} must be a positive bigint ID string.`)
  }
  return value
}
export function parseCountryCode(value) {
  if (value === undefined) return undefined
  const code = value.toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) throw fail(400, 'invalid_parameter', 'country_code must be a two-letter ISO country code.')
  return code
}
export function positiveInteger(value, fallback, max) {
  if (value === undefined) return fallback
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw fail(400, 'invalid_parameter', 'Invalid pagination value.')
  return Number(value)
}
export function concertFilterParams(input) {
  return Object.fromEntries(concertFilterNames.filter(key => input[key] !== undefined).map(key => [key, input[key]]))
}
export function parseInput(query) {
  const allowed = new Set([...concertFilterNames, 'format', 'page', 'page_size', 'all'])
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.has(key) || typeof value !== 'string') throw fail(400, 'invalid_parameter', `Invalid parameter: ${key}`)
  }
  if (!concertFilterNames.some(key => query[key] !== undefined)) throw fail(400, 'invalid_parameter', 'Supply at least one of url, country_code, city_id, performer_id or venue_id.')
  if (query.url !== undefined && (!query.url.trim() || query.url.length > 4096)) throw fail(400, 'invalid_url', 'url must not be empty or exceed 4096 characters.')
  const url = query.url === undefined ? undefined : normalizeUrl(query.url)
  const format = query.format ?? 'json'
  if (!['json', 'csv'].includes(format)) throw fail(400, 'invalid_format', 'format must be json or csv.')
  if (query.all !== undefined && !['true', 'false'].includes(query.all)) throw fail(400, 'invalid_parameter', 'all must be true or false.')
  const all = query.all === 'true'
  if (all && (query.page !== undefined || query.page_size !== undefined)) throw fail(400, 'invalid_parameter', 'all=true cannot be combined with pagination.')
  return { url, submittedUrl: query.url, country_code: parseCountryCode(query.country_code),
    city_id: parseId(query.city_id, 'city_id'), performer_id: parseId(query.performer_id, 'performer_id'), venue_id: parseId(query.venue_id, 'venue_id'),
    format, all, page: positiveInteger(query.page, 1, 1000000), pageSize: positiveInteger(query.page_size, 50, 100) }
}
const csvCell = value => {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  // Quote escaping alone does not prevent spreadsheet formulas.
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function serializeCsv(concerts) {
  return '\uFEFF' + [fields.map(csvCell).join(','), ...concerts.map(row => fields.map(key => csvCell(row[key])).join(','))].join('\r\n') + '\r\n'
}
export const MAX_EXPORT_ROWS = 10000
export const MAX_EXPORT_BYTES = 20 * 1024 * 1024
export function assertExportSize(text) {
  if (Buffer.byteLength(text) > MAX_EXPORT_BYTES) throw fail(422, 'export_too_large', 'Export exceeds 20 MiB; use pagination.')
}
