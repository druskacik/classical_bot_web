import { defineEventHandler, getQuery, getHeader, setHeader, setResponseStatus } from 'h3'
import { createDataCache } from '../../../layers/concerts/server/utils/data-cache.js'
import { contactClientIP } from '../contact.js'
import { parseInput, concertFilterParams, serializeCsv, assertExportSize } from './contract.js'
import { createLimiter } from './limiter.js'

export function createConcertApiHandler({ load, prepare, snapshot = callback => callback(null, {}), cache = createDataCache(), limiter = createLimiter(), env = process.env, log = console.info }) {
  return defineEventHandler(async event => {
    const started = performance.now()
    let status = 200, count = 0, format = 'unknown'
    setHeader(event, 'Access-Control-Allow-Origin', '*')
    setHeader(event, 'Access-Control-Allow-Methods', 'GET, OPTIONS')
    setHeader(event, 'Access-Control-Expose-Headers', 'X-Total-Count, Link, Content-Disposition, Retry-After, X-Source-Status')
    setHeader(event, 'Cache-Control', 'no-store')
    if (event.method === 'OPTIONS') { setResponseStatus(event, 204); return null }
    try {
      const input = parseInput(getQuery(event))
      format = input.format
      const ip = contactClientIP(event.node.req.socket.remoteAddress, getHeader(event, 'x-forwarded-for'), env.BUSINESS_API_TRUST_PROXY_HOPS)
      limiter.attempt(ip, input.all)
      const sourceState = input.url && prepare ? await prepare(input, ip) : null
      const key = JSON.stringify([concertFilterParams(input), sourceState?.id ?? null, sourceState?.registryRevision ?? null, input.all, input.page, input.pageSize, new Date().toISOString().slice(0, 10)])
      const cached = await snapshot((trx, publication) => cache.get('business-api-concerts-serving-v1', `${key}:${publication.publishedAt || ''}`, 120000, async () => {
        if (input.all) limiter.reserve()
        try { return await load(input, trx, sourceState) }
        finally { if (input.all) limiter.release() }
      }))
      const result = { ...cached, pagination: { ...cached.pagination, next: null }, source: cached.source ? { ...cached.source } : null }
      if (sourceState) {
        result.source.status = sourceState.status
        result.source.next_attempt_at = sourceState.next_attempt_at
        setHeader(event, 'X-Source-Status', sourceState.status)
      }
      count = result.concerts.length
      const pending = ['pending', 'processing', 'pr_open', 'retry_wait'].includes(sourceState?.status)
      const stopped = ['blocked', 'disabled', 'needs_attention'].includes(sourceState?.status)
      if (result.pagination.total === 0 && (pending || stopped)) {
        status = pending ? 202 : 200
        setResponseStatus(event, status)
        setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
        setHeader(event, 'X-Total-Count', '0')
        if (pending) setHeader(event, 'Retry-After', '60')
        return { ...result, message: pending ? 'Source onboarding is in progress. Repeat this request to check for concerts.' : `Source status is ${sourceState.status}. No upcoming concerts are available.` }
      }
      const { pagination } = result
      let next = null
      if (!input.all && input.page < pagination.total_pages) {
        const params = new URLSearchParams({ ...concertFilterParams(input), format, page: String(input.page + 1), page_size: String(input.pageSize) })
        next = `/api/v1/concerts?${params}`
      }
      pagination.next = next
      const body = format === 'csv' ? serializeCsv(result.concerts) : JSON.stringify(result)
      assertExportSize(body)
      setHeader(event, 'X-Total-Count', String(pagination.total))
      if (next) setHeader(event, 'Link', `<${next}>; rel="next"`)
      if (format === 'csv') {
        setHeader(event, 'Content-Type', 'text/csv; charset=utf-8; header=present')
        setHeader(event, 'Content-Disposition', 'attachment; filename="concerts.csv"')
      } else setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
      return body
    } catch (error) {
      if (error.statusCode === 503) {
        status = 503
        setResponseStatus(event, status)
        setHeader(event, 'Retry-After', '60')
        return { error: { code: 'catalogue_unavailable', message: 'Concert catalogue temporarily unavailable.' } }
      }
      const expected = typeof error.code === 'string' && Number.isInteger(error.statusCode)
      status = expected ? error.statusCode : 500
      setResponseStatus(event, status)
      setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
      if (status === 429) setHeader(event, 'Retry-After', String(error.details?.retry_after || 60))
      return { error: { code: expected ? error.code : 'internal_error', message: expected ? error.message : 'Unable to retrieve concerts.', ...(expected && error.details ? { details: error.details } : {}) } }
    } finally {
      log(JSON.stringify({ endpoint: 'business-concerts', status, format, count, duration_ms: Math.round(performance.now() - started) }))
    }
  })
}
