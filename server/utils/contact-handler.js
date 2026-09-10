import nodemailer from 'nodemailer'
import { createError, defineEventHandler, getHeader, setHeader } from 'h3'
import { classicalBotSite } from '../../site.config.js'
import { contactClientIP, contactMail, createContactLimiter, readContactBody, smtpSettings, validateContact, MAX_BODY_BYTES } from './contact.js'

export function createContactHandler({ env = process.env, limiter = createContactLimiter(), createTransport = nodemailer.createTransport } = {}) {
  return defineEventHandler(async (event) => {
    setHeader(event, 'Cache-Control', 'no-store')
    const origin = getHeader(event, 'origin')
    const allowed = new Set([classicalBotSite.origin])
    if (env.NODE_ENV !== 'production' && origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) allowed.add(origin)
    if (!origin || !allowed.has(origin) || getHeader(event, 'sec-fetch-site') === 'cross-site') {
      throw createError({ statusCode: 403, statusMessage: 'Please submit the form from the contact page' })
    }
    if (getHeader(event, 'content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw createError({ statusCode: 415, statusMessage: 'Expected a JSON form submission' })
    }
    if (Number(getHeader(event, 'content-length')) > MAX_BODY_BYTES) throw createError({ statusCode: 413, statusMessage: 'Message is too large' })
    const unavailable = () => createError({ statusCode: 503, statusMessage: 'Your message could not be sent. Please try again later.' })
    let ip
    try { ip = contactClientIP(event.node.req.socket.remoteAddress, getHeader(event, 'x-forwarded-for'), env.CONTACT_TRUST_PROXY_HOPS) }
    catch { throw unavailable() }
    const limit = (seconds) => {
      if (!seconds) return
      setHeader(event, 'Retry-After', seconds)
      throw createError({ statusCode: 429, statusMessage: 'Too many messages. Please try again later.' })
    }
    limit(limiter.attempt(ip))
    const contact = validateContact(await readContactBody(event.node.req))
    if (!contact) return { ok: true }
    let settings
    try { settings = smtpSettings(env) } catch { throw unavailable() }
    limit(limiter.reserve())
    let transport
    try {
      transport = createTransport(settings.transport)
      const result = await transport.sendMail(contactMail(settings, contact))
      if (!result.accepted?.length || result.rejected?.length) throw new Error('Recipient not accepted')
      return { ok: true }
    } catch {
      // Never log SMTP exceptions: they can include credentials or message data.
      console.error('[contact] SMTP delivery failed')
      throw unavailable()
    } finally {
      transport?.close()
      limiter.release()
    }
  })
}
