import { createError, defineEventHandler, getHeader, getRouterParam, setHeader } from 'h3'
import db from '../../../layers/concerts/server/utils/connection.js'
import { classicalBotSite } from '../../../site.config.js'
import { contactClientIP, readContactBody } from '../contact.js'
import { managementToken } from './core.js'
import { sendMail, mailSettings } from '../mail.js'
import { criteria } from './criteria.js'
import { requestAlert, confirmAlert, listAlerts, saveAlert, removeAlert, unsubscribe, rateLimit } from './service.js'
const actions = new Set(['preview', 'request', 'confirm', 'manage', 'update', 'create', 'remove', 'unsubscribe'])
export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  const action = getRouterParam(event, 'action')
  if (!actions.has(action)) throw createError({ statusCode: 404 })
  if (['preview', 'request', 'confirm', 'update', 'create'].includes(action) && process.env.NUXT_PUBLIC_ALERTS_SIGNUP_ENABLED !== 'true') throw createError({ statusCode: 503, statusMessage: 'New concert alerts are currently unavailable.' })
  const origin = getHeader(event, 'origin')
  const local = process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '')
  if ((!local && origin !== classicalBotSite.origin) || getHeader(event, 'sec-fetch-site') === 'cross-site') throw createError({ statusCode: 403 })
  if (getHeader(event, 'content-type')?.split(';')[0].trim() !== 'application/json') throw createError({ statusCode: 415 })
  try {
    const ip = contactClientIP(event.node.req.socket.remoteAddress, getHeader(event, 'x-forwarded-for'), process.env.CONTACT_TRUST_PROXY_HOPS)
    await rateLimit(db, `ip:${ip}:${action === 'request' ? 'request' : 'other'}`, action === 'request' ? 5 : 120, 900)
    const body = await readContactBody(event.node.req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw createError({ statusCode: 400 })
    if (action === 'preview') { const selected = await criteria(db, body.criteria); return { summary: selected.summary, criteria: selected.query } }
    if (action === 'request') {
      managementToken({ id: 0, generation: 0 }); mailSettings()
      if (body.website) return { ok: true }
      await rateLimit(db, 'confirmation-budget', 30, 3600)
      return await requestAlert(db, body, sendMail, local ? origin : classicalBotSite.origin)
    }
    if (action === 'confirm') return await confirmAlert(db, body.token)
    if (action === 'manage') return await listAlerts(db, body.token, body.offset ?? 0, body.focusId)
    if (action === 'create') return await saveAlert(db, body.token, body.criteria)
    if (action === 'update') { if (!body.alertId) throw createError({ statusCode: 400 }); return await saveAlert(db, body.token, body.criteria, body.alertId) }
    if (action === 'remove') return await removeAlert(db, body.token, body.alertId)
    return await unsubscribe(db, body.token)
  } catch (error) {
    if (error.statusCode) throw error
    console.error('[alerts] Request failed')
    throw createError({ statusCode: 503, statusMessage: 'Your alert could not be processed. Please try again later.' })
  }
})
