import { createError } from 'h3'
import { criteria, matching } from './criteria.js'
import { hash, token, tokenHash, normalizeEmail, subscriberToken, confirmationMail } from './core.js'
const invalidLink = () => createError({ statusCode: 400, statusMessage: 'This link is invalid or has expired. Open Manage alerts from a recent email.' })
export async function rateLimit(db, key, maximum, seconds) {
  const { rows } = await db.raw(`INSERT INTO concert_alert_rate (key, count, expires_at) VALUES (?, 1, now() + ? * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN concert_alert_rate.expires_at <= now() THEN 1 ELSE concert_alert_rate.count + 1 END,
    expires_at = CASE WHEN concert_alert_rate.expires_at <= now() THEN EXCLUDED.expires_at ELSE concert_alert_rate.expires_at END
    RETURNING count`, [hash(key), seconds])
  if (rows[0].count > maximum) throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Please try again later.' })
}
export async function ensureManagement(trx, subscriber) {
  const secret = subscriberToken(subscriber)
  if (subscriber.management_hash && subscriber.management_hash !== hash(secret)) throw new Error('Alert token secret changed')
  if (!subscriber.management_hash) await trx('concert_alert_subscriber').where('id', subscriber.id).update({ management_hash: hash(secret) })
  return secret
}
export async function getSubscriber(db, secret, lock = false) {
  const hashed = tokenHash(secret)
  let subscriber = await db('concert_alert_subscriber').where('management_hash', hashed).first()
  if (!subscriber) {
    // Preserve private links from the original single-alert implementation.
    const legacy = await db('concert_alert').where('management_hash', hashed).first()
    if (legacy) subscriber = await db('concert_alert_subscriber').where('id', legacy.subscriber_id).first()
  }
  if (!subscriber) throw invalidLink()
  return lock ? db('concert_alert_subscriber').where('id', subscriber.id).forUpdate().first() : subscriber
}
const positiveId = value => {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) throw createError({ statusCode: 400, statusMessage: 'Choose a valid alert.' })
  return String(value)
}
async function ownedAlert(trx, subscriber, id) {
  const alert = await trx('concert_alert').where({ id: positiveId(id), subscriber_id: subscriber.id }).whereNull('removed_at').first()
  if (!alert) throw createError({ statusCode: 404, statusMessage: 'This alert is no longer available.' })
  return alert
}
// A stable identity uses parsed filter values, never presentation labels or key order.
export function criteriaIdentity(selected) {
  const f = selected.filters
  return JSON.stringify({ country: f.country || null, city: f.area ? null : f.city,
    area: f.area ? [f.area.cityId || null, f.area.latitude, f.area.longitude, f.area.radiusKm] : null,
    from: f.dateFrom || null, to: f.dateTo || null,
    composers: [...f.composers].sort(), works: [...new Set(f.works)].sort((a,b) => a-b) })
}
async function duplicate(trx, subscriber, selected, except) {
  const identity = criteriaIdentity(selected)
  const rows = await trx('concert_alert').where('subscriber_id', subscriber.id).whereNull('removed_at').whereIn('status', ['pending', 'active'])
  for (const row of rows) {
    if (String(row.id) === String(except)) continue
    const existing = await criteria(trx, row.status === 'pending' ? row.pending_criteria : row.criteria, { allowExpired: true })
    if (criteriaIdentity(existing) === identity) return row
  }
}
async function baseline(trx, alertId, selected) {
  await trx('concert_alert_seen').where('alert_id', alertId).delete()
  await trx('concert_alert_seen').insert(matching(trx, selected.filters).select(trx.raw('?::bigint as alert_id', [alertId]), 'cc.id as concert_id'))
}
async function activate(trx, alert, selected) {
  await baseline(trx, alert.id, selected)
  await trx('concert_alert').where('id', alert.id).update({ criteria: selected.query, summary: selected.summary, status: 'active', generation: alert.generation + 1,
    pending_criteria: null, pending_summary: null, confirmation_hash: null, confirmation_expires_at: null, activated_at: trx.fn.now() })
}
export async function requestAlert(db, body, send, origin) {
  const email = normalizeEmail(body.email)
  await rateLimit(db, `email:${email}`, 3, 3600)
  const selected = await criteria(db, body.criteria)
  const confirmation = token()
  const result = await db.transaction(async trx => {
    await trx('concert_alert_subscriber').insert({ email }).onConflict('email').ignore()
    const subscriber = await trx('concert_alert_subscriber').where({ email }).forUpdate().first()
    const management = await ensureManagement(trx, subscriber)
    let alert = await duplicate(trx, subscriber, selected)
    if (alert?.status === 'active') return { management, existing: true }
    if (!alert) [alert] = await trx('concert_alert').insert({ email, subscriber_id: subscriber.id }).returning('*')
    await trx('concert_alert').where('id', alert.id).update({ pending_criteria: selected.query, pending_summary: selected.summary, confirmation_hash: hash(confirmation), confirmation_expires_at: new Date(Date.now() + 24 * 3600_000) })
    return { management, existing: false }
  })
  await send(confirmationMail(email, selected.summary, origin, confirmation, result.management, result.existing))
  return { ok: true }
}
export async function confirmAlert(db, secret) {
  const hashed = tokenHash(secret)
  return db.transaction(async trx => {
    const candidate = await trx('concert_alert').where('confirmation_hash', hashed).first()
    if (!candidate) throw invalidLink()
    const subscriber = await trx('concert_alert_subscriber').where('id', candidate.subscriber_id).forUpdate().first()
    const alert = await trx('concert_alert').where({ id: candidate.id, confirmation_hash: hashed }).whereNull('removed_at').where('confirmation_expires_at', '>', trx.fn.now()).first()
    if (!alert?.pending_criteria) throw invalidLink()
    const selected = await criteria(trx, alert.pending_criteria)
    const existing = await duplicate(trx, subscriber, selected, alert.id)
    if (existing) {
      await trx('concert_alert').where('id', alert.id).update({ removed_at: trx.fn.now(), confirmation_hash: null, confirmation_expires_at: null })
      return { token: await ensureManagement(trx, subscriber), alertId: existing.id, duplicate: true }
    }
    await activate(trx, alert, selected)
    return { token: await ensureManagement(trx, subscriber), alertId: alert.id }
  })
}
export async function listAlerts(db, secret, offset = 0, focusId) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw createError({ statusCode: 400 })
  const subscriber = await getSubscriber(db, secret)
  const query = db('concert_alert').where('subscriber_id', subscriber.id).whereNull('removed_at')
  if (focusId) query.orderByRaw('CASE WHEN id = ? THEN 0 ELSE 1 END', [positiveId(focusId)])
  const rows = await query.orderByRaw("CASE WHEN status IN ('active','pending') THEN 0 ELSE 1 END").orderBy('id', 'desc').offset(offset).limit(51)
    .select('id', 'status', 'criteria', 'summary', 'pending_criteria', 'pending_summary')
  return { email: subscriber.email, alerts: rows.slice(0,50).map(a => ({ id: a.id, status: a.status, criteria: a.criteria || a.pending_criteria, summary: a.summary || a.pending_summary })), nextOffset: rows.length > 50 ? offset + 50 : null }
}
export async function saveAlert(db, secret, input, id) {
  return db.transaction(async trx => {
    const subscriber = await getSubscriber(trx, secret, true)
    const alert = id == null ? null : await ownedAlert(trx, subscriber, id)
    const selected = await criteria(trx, input)
    const existing = await duplicate(trx, subscriber, selected, alert?.id)
    if (existing) return { ok: true, duplicate: true, alertId: existing.id }
    const created = alert || (await trx('concert_alert').insert({ email: subscriber.email, subscriber_id: subscriber.id }).returning('*'))[0]
    await activate(trx, created, selected)
    return { ok: true, alertId: created.id }
  })
}
export async function removeAlert(db, secret, id) {
  return db.transaction(async trx => {
    const subscriber = await getSubscriber(trx, secret, true)
    const alert = await ownedAlert(trx, subscriber, id)
    await trx('concert_alert').where('id', alert.id).update({ removed_at: trx.fn.now(), status: 'unsubscribed', generation: alert.generation + 1, confirmation_hash: null, confirmation_expires_at: null, pending_criteria: null, pending_summary: null })
    return { ok: true }
  })
}
export async function unsubscribe(db, secret) {
  return db.transaction(async trx => {
    const subscriber = await getSubscriber(trx, secret, true)
    await trx('concert_alert').where('subscriber_id', subscriber.id).update({ status: 'unsubscribed', pending_criteria: null, pending_summary: null, confirmation_hash: null, confirmation_expires_at: null })
    await trx('concert_alert_digest').where('subscriber_id', subscriber.id).where('status', 'pending').update({ status: 'cancelled' })
    return { ok: true }
  })
}
