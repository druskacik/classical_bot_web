import { defineEventHandler, getQuery, getHeader, setHeader, setResponseStatus } from 'h3'
import { createDataCache } from '../../../layers/concerts/server/utils/data-cache.js'
import { contactClientIP } from '../contact.js'
import { assertExportSize } from './contract.js'
import { parseEntityInput, entityParams } from './query-entities.js'
import { createLimiter } from './limiter.js'

export function createEntityApiHandler({ kind, load, snapshot = callback => callback(null, {}), cache = createDataCache(), limiter = createLimiter(), env = process.env, log = console.info }) {
  return defineEventHandler(async event => {
    const started = performance.now()
    let status = 200, count = 0
    setHeader(event, 'Access-Control-Allow-Origin', '*')
    setHeader(event, 'Access-Control-Allow-Methods', 'GET, OPTIONS')
    setHeader(event, 'Access-Control-Expose-Headers', 'X-Total-Count, Link, Retry-After')
    setHeader(event, 'Cache-Control', 'no-store')
    if (event.method === 'OPTIONS') { setResponseStatus(event, 204); return null }
    setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
    try {
      const input = parseEntityInput(kind, getQuery(event))
      const ip = contactClientIP(event.node.req.socket.remoteAddress, getHeader(event, 'x-forwarded-for'), env.BUSINESS_API_TRUST_PROXY_HOPS)
      limiter.attempt(ip, false)
      const key = JSON.stringify(input)
      const cached = await snapshot((trx, publication) => cache.get(`business-api-${kind}-v1`, `${key}:${publication.publishedAt || ''}:${publication.currentDate || ''}`, 120000, () => load(input, trx)))
      const result = { ...cached, pagination: { ...cached.pagination, next: null } }
      count = result.items.length
      if (input.page < result.pagination.total_pages) {
        const params = new URLSearchParams({ ...entityParams(input), page: String(input.page + 1), page_size: String(input.pageSize) })
        result.pagination.next = `/api/v1/${kind}?${params}`
      }
      const body = JSON.stringify(result)
      assertExportSize(body)
      setHeader(event, 'X-Total-Count', String(result.pagination.total))
      if (result.pagination.next) setHeader(event, 'Link', `<${result.pagination.next}>; rel="next"`)
      return body
    } catch (error) {
      const expected = typeof error.code === 'string' && Number.isInteger(error.statusCode)
      status = error.statusCode === 503 ? 503 : expected ? error.statusCode : 500
      setResponseStatus(event, status)
      if (status === 503) {
        setHeader(event, 'Retry-After', '60')
        return { error: { code: 'catalogue_unavailable', message: 'Concert catalogue temporarily unavailable.' } }
      }
      if (status === 429) setHeader(event, 'Retry-After', String(error.details?.retry_after || 60))
      return { error: { code: expected ? error.code : 'internal_error', message: expected ? error.message : 'Unable to search entities.', ...(expected && error.details ? { details: error.details } : {}) } }
    } finally {
      log(JSON.stringify({ endpoint: `business-${kind}`, status, count, duration_ms: Math.round(performance.now() - started) }))
    }
  })
}
