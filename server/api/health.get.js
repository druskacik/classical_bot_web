import { defineEventHandler, setResponseHeader } from 'h3'

// Container health only: do not depend on PostgreSQL or optional background work.
export default defineEventHandler(event => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { status: 'ok' }
})
