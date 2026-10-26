import { defineEventHandler, getQuery, setHeader } from 'h3'
import { createDataCache } from '../../../layers/concerts/server/utils/data-cache.js'
import { prepareResponse, clientIP, setPaginationHeaders, errorResponse } from './http.js'
import { assertExportSize } from './contract.js'
import { parseEntityInput, entityParams } from './query-entities.js'
import { createLimiter } from './limiter.js'

export function createEntityApiHandler({ kind, load, snapshot = callback => callback(null, {}), cache = createDataCache(), limiter = createLimiter(), env = process.env, log = console.info }) {
  return defineEventHandler(async event => {
    const started = performance.now()
    let status = 200, count = 0
    if (prepareResponse(event, 'X-Total-Count, Link, Retry-After')) return null
    setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
    try {
      const input = parseEntityInput(kind, getQuery(event))
      limiter.attempt(clientIP(event, env), false)
      const cached = await snapshot((trx, publication) => cache.get(`business-api-${kind}-v1`, `${JSON.stringify(input)}:${publication.publishedAt || ''}:${publication.currentDate || ''}`, 120000, () => load(input, trx)))
      const result = { ...cached, pagination: { ...cached.pagination, next: null } }
      count = result.items.length
      result.pagination.next = input.page < result.pagination.total_pages
        ? `/api/v1/${kind}?${new URLSearchParams({ ...entityParams(input), page: String(input.page + 1), page_size: String(input.pageSize) })}`
        : null
      const body = JSON.stringify(result)
      assertExportSize(body)
      setPaginationHeaders(event, result.pagination)
      return body
    } catch (error) {
      const response = errorResponse(event, error, 'Unable to search entities.')
      status = response.status
      return response.body
    } finally {
      log(JSON.stringify({ endpoint: `business-${kind}`, status, count, duration_ms: Math.round(performance.now() - started) }))
    }
  })
}
