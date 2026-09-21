import { createHash, createHmac, randomBytes } from 'node:crypto'
import { createError } from 'h3'
export const token = () => randomBytes(32).toString('base64url')
export const hash = value => createHash('sha256').update(value).digest('hex')
export function tokenHash(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw createError({ statusCode: 400, statusMessage: 'This link is invalid or has expired.' })
  return hash(value)
}
export function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s<>@,;:\x00-\x1f\x7f]+@[^\s<>@,;:\x00-\x1f\x7f]+\.[^\s<>@,;:\x00-\x1f\x7f]+$/.test(value.trim())) throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address.' })
  return value.trim().toLowerCase()
}
export function alertDay(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, due: Number(parts.hour) >= 8 }
}
export function failureKind(error) {
  if (error.code === 'EENVELOPE' && error.responseCode >= 500) return 'rejected'
  if (error.responseCode >= 400 && error.responseCode < 500) return 'retry'
  if (['ECONNECTION', 'EDNS', 'EAUTH', 'ESOCKET'].includes(error.code) && !['DATA', 'CONN'].includes(error.command)) return 'retry'
  if (error.command === 'CONN') return 'retry'
  return 'held'
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export const safeUrl = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null } catch { return null } }
export function digestMail(subscription, concerts, origin, secret, deliveryId) {
  const manage = `${origin}/alerts/manage#${secret}`
  const unsubscribe = `${origin}/alerts/manage#${secret}:unsubscribe`
  const rows = concerts.map(c => ({ ...c, url: safeUrl(c.url), detail: [c.date, c.time_from?.slice(0, 5), c.city, c.venue].filter(Boolean).join(' · ') }))
  return {
    to: subscription.email,
    messageId: `<digest-${deliveryId}@${new URL(origin).hostname}>`,
    subject: `${concerts.length} new concert${concerts.length === 1 ? '' : 's'} matching your alerts`,
    text: `New concerts matching your saved searches\n\n${rows.map(c => `${c.title}\n${c.detail}\n${c.programme || ''}\nMatches: ${(c.matches || []).join('; ')}\n${c.url || ''}`).join('\n\n')}\n\nManage alerts: ${manage}\nUnsubscribe from all: ${unsubscribe}`,
    html: `<html lang="en"><body style="font-family:Arial,sans-serif;color:#1e293b;max-width:640px;margin:24px auto;padding:16px"><h1 style="font-family:Georgia,serif;font-weight:normal">New concerts for you</h1><p>New concerts matching your saved searches.</p>${rows.map(c => `<div style="padding:16px 0;border-top:1px solid #e2e8f0"><h2 style="font-size:18px">${c.url ? `<a href="${escape(c.url)}">${escape(c.title)}</a>` : escape(c.title)}</h2><p>${escape(c.detail)}</p>${c.programme ? `<p>${escape(c.programme)}</p>` : ''}<p style="font-size:14px">Matches: ${escape((c.matches || []).join('; '))}</p></div>`).join('')}<p><a href="${escape(manage)}">Manage alerts</a> · <a href="${escape(unsubscribe)}">Unsubscribe from all</a></p></body></html>`,
  }
}

export function managementToken(alert, key = process.env.ALERTS_TOKEN_SECRET) {
  if (typeof key !== 'string' || key.length < 32) throw new Error('Alert token secret is not configured')
  return createHmac('sha256', key).update(`${alert.id}:${alert.generation}`).digest('base64url')
}

export function subscriberToken(subscriber, key = process.env.ALERTS_TOKEN_SECRET) {
  if (typeof key !== 'string' || key.length < 32) throw new Error('Alert token secret is not configured')
  return createHmac('sha256', key).update(`subscriber:${subscriber.id}:${subscriber.generation}`).digest('base64url')
}
export function confirmationMail(email, summary, origin, confirmation, management, existing = false) {
  const confirm = `${origin}/alerts/confirm#${confirmation}`
  const manage = `${origin}/alerts/manage#${management}`
  const heading = existing ? 'You already have this alert' : 'Confirm your concert alert'
  const explanation = existing ? 'This search is already active. Your other alerts are unchanged.' : 'Open the link below within 24 hours to activate this search. Your other alerts are unchanged.'
  return {
    to: email, subject: heading,
    text: `${heading}\n${summary}\n\nOne daily email with new matches across all your alerts.\n${explanation}\n${existing ? '' : `Confirm alert: ${confirm}\n`}\nManage alerts: ${manage}\n\nIf you did not request this, ignore this email.`,
    html: `<html lang="en"><body style="font-family:Arial,sans-serif;color:#1e293b;max-width:640px;margin:24px auto;padding:16px"><h1 style="font-family:Georgia,serif;font-weight:normal">${heading}</h1><p>${escape(summary)}</p><p>One daily email with new matches across all your alerts.</p><p>${explanation}</p>${existing ? '' : `<p><a href="${escape(confirm)}" style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none">Confirm alert</a></p>`}<p style="padding-top:16px;border-top:1px solid #e2e8f0"><a href="${escape(manage)}">Manage alerts</a></p><p>If you did not request this, ignore this email.</p></body></html>`,
  }
}
