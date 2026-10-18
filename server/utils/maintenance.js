import { getRequestURL, send, setResponseHeader, setResponseStatus } from 'h3'

export function maintenanceEnabled(value) {
  return value === true || value === 'true'
}

export function maintenanceResponse(event) {
  const path = getRequestURL(event).pathname
  const api = path === '/api' || path.startsWith('/api/')
  setResponseStatus(event, 503, 'Service Unavailable')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  event.context.maintenance = true

  if (api) {
    setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
    const body = JSON.stringify({ statusCode: 503, statusMessage: 'Service Unavailable', message: 'ClassicalBot is temporarily unavailable for scheduled maintenance.' })
    return send(event, event.method === 'HEAD' ? '' : body)
  }

  // Dynamic server endpoints must not run while the database is offline.
  // Page GETs continue to Nuxt, whose router selects only the maintenance page.
  if (!['GET', 'HEAD'].includes(event.method) || /\.(xml|xsl)$/.test(path) || path.startsWith('/__')) {
    setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    return send(event, event.method === 'HEAD' ? '' : 'ClassicalBot is temporarily unavailable for scheduled maintenance.')
  }
  if (event.method === 'HEAD') {
    setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
    return send(event, '')
  }
}
