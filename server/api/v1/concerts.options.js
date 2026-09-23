import { defineEventHandler, setHeader, setResponseStatus } from 'h3'
export default defineEventHandler(event => {
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  setHeader(event, 'Access-Control-Allow-Methods', 'GET, OPTIONS')
  setHeader(event, 'Access-Control-Max-Age', '600')
  setResponseStatus(event, 204)
  return null
})
