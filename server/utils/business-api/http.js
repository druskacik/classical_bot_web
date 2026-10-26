import { getHeader, setHeader, setResponseStatus } from 'h3'
import { contactClientIP } from '../contact.js'

export function prepareResponse(event, exposedHeaders) {
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  setHeader(event, 'Access-Control-Allow-Methods', 'GET, OPTIONS')
  setHeader(event, 'Access-Control-Expose-Headers', exposedHeaders)
  setHeader(event, 'Cache-Control', 'no-store')
  if (event.method === 'OPTIONS') { setResponseStatus(event, 204); return true }
  return false
}

export const clientIP = (event, env) =>
  contactClientIP(event.node.req.socket.remoteAddress, getHeader(event, 'x-forwarded-for'), env.BUSINESS_API_TRUST_PROXY_HOPS)

export function setPaginationHeaders(event, pagination) {
  setHeader(event, 'X-Total-Count', String(pagination.total))
  if (pagination.next) setHeader(event, 'Link', `<${pagination.next}>; rel="next"`)
}

export function errorResponse(event, error, fallbackMessage) {
  const expected = typeof error.code === 'string' && Number.isInteger(error.statusCode)
  const status = error.statusCode === 503 ? 503 : expected ? error.statusCode : 500
  setResponseStatus(event, status)
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  if (status === 503 || status === 429) setHeader(event, 'Retry-After', String(status === 503 ? 60 : error.details?.retry_after || 60))
  return { status, body: { error: status === 503
    ? { code: 'catalogue_unavailable', message: 'Concert catalogue temporarily unavailable.' }
    : { code: expected ? error.code : 'internal_error', message: expected ? error.message : fallbackMessage, ...(expected && error.details ? { details: error.details } : {}) } } }
}
