import { criteria, matching, concertDetails } from './criteria.js'
import { createError } from 'h3'
import { alertDay, digestMail, failureKind, token } from './core.js'
import { ensureManagement } from './service.js'

// The worker holds advisory lock 78239001 across replicas before reserving slots.
// Store each attempt separately so retries and bursts share an exact rolling hour.
async function reserveDigestAttempt(db, maximum) {
  const { count } = await db('concert_alert_rate').whereLike('key', 'digest-attempt:%')
    .where('expires_at', '>', db.fn.now()).count('* as count').first()
  if (Number(count) >= maximum) throw createError({ statusCode: 429, statusMessage: 'Hourly alert sending limit reached.' })
  await db('concert_alert_rate').insert({ key: `digest-attempt:${token()}`, count: 1, expires_at: db.raw("now() + interval '1 hour'") })
}

async function newMatches(trx, subscriber) {
  const alerts = await trx('concert_alert').where({ subscriber_id: subscriber.id, status: 'active' }).whereNull('removed_at').orderBy('id')
  const selected = []
  for (const alert of alerts) {
    const search = await criteria(trx, alert.criteria, { allowExpired: true })
    const rows = await matching(trx, search.filters).whereNotIn('cc.id', trx.raw(`WITH RECURSIVE history(id) AS (
      SELECT concert_id FROM concert_alert_seen WHERE alert_id = ?
      UNION SELECT concert_id FROM concert_alert_delivered WHERE subscriber_id = ?
      UNION SELECT c.duplicate_of_id FROM classical_concert c JOIN history h ON c.id = h.id WHERE c.duplicate_of_id IS NOT NULL
    ) SELECT id FROM history`, [alert.id, subscriber.id])).select('cc.id', 'cc.date').orderBy('cc.date').orderBy('cc.id').limit(50)
    selected.push({ alert, search, rows })
  }
  const unique = new Map()
  for (const { rows } of selected) for (const row of rows) unique.set(row.id, row)
  const ids = new Set([...unique.values()].sort((a,b) => new Date(a.date)-new Date(b.date) || a.id-b.id).slice(0,50).map(r=>r.id))
  return selected.filter(s=>s.rows.some(r=>ids.has(r.id))).map(s=>({ alertId: String(s.alert.id), generation: s.alert.generation, concertIds: s.rows.filter(r=>ids.has(r.id)).map(r=>r.id) }))
}
async function renderMatches(trx, subscriber, matches) {
  const concerts = new Map()
  for (const match of matches) {
    const alert = await trx('concert_alert').where({ id: match.alertId, subscriber_id: subscriber.id, status: 'active', generation: match.generation }).whereNull('removed_at').first()
    if (!alert) continue
    const search = await criteria(trx, alert.criteria, { allowExpired: true })
    for (const concert of await concertDetails(trx, search.filters, match.concertIds)) {
      const entry = concerts.get(concert.id) || { ...concert, matches: [], alertIds: [] }
      entry.matches.push(alert.summary); entry.alertIds.push(alert.id)
      concerts.set(concert.id, entry)
    }
  }
  return [...concerts.values()].sort((a,b)=>a.date.localeCompare(b.date) || a.id-b.id)
}
export async function runAlerts(db, { send, origin, now = new Date(), hourlyLimit = 200 } = {}) {
  if (!Number.isSafeInteger(hourlyLimit) || hourlyLimit < 1) throw new Error('Invalid alert budget')
  const connection = await db.client.acquireConnection()
  const stats = { accepted: 0, failed: 0, held: 0, skipped: 0 }
  try {
    if (!(await db.raw('SELECT pg_try_advisory_lock(78239001) AS locked').connection(connection)).rows[0].locked) return { skipped: 'locked' }
    const { day, due } = alertDay(now)
    if (!due) return { skipped: 'before_delivery_time' }
    await db('concert_alert_digest').where('status', 'sending').update({ status: 'held', failure_kind: 'interrupted' })
    await db('concert_alert_rate').where('expires_at', '<', db.fn.now()).delete()
    const subscribers = await db('concert_alert_subscriber').where(q=>q.whereNull('last_digest_day').orWhere('last_digest_day','<',day)).orderBy('id').select('id')
    for (const { id } of subscribers) {
      try {
        const delivery = await db.transaction(async trx => {
          const subscriber = await trx('concert_alert_subscriber').where('id',id).forUpdate().first()
          await trx('concert_alert').where({ subscriber_id:id, status:'active' }).whereRaw("criteria->>'dateTo' < to_char(CURRENT_DATE, 'YYYY-MM-DD')").update({ status:'expired' })
          await trx('concert_alert').where({ subscriber_id:id, status:'pending' }).where('created_at','<',new Date(now.valueOf()-7*86400_000)).whereNull('management_hash')
            .where(q=>q.whereNull('confirmation_expires_at').orWhere('confirmation_expires_at','<=',trx.fn.now())).delete()
          if (await trx('concert_alert_digest').where({ subscriber_id:id, status:'held' }).first()) return null
          const existing = await trx('concert_alert_digest').where({ subscriber_id:id, status:'pending' }).orderBy('id').first()
          if (existing) {
            if (existing.attempts >= 3) { await trx('concert_alert_digest').where('id',existing.id).update({status:'held',failure_kind:'retry_exhausted'}); return null }
            if (existing.attempted_at && now-new Date(existing.attempted_at)<3600_000) return null
            // Definitely failed sends can be rebuilt after edits without discarding new matches.
            const matches = await newMatches(trx, subscriber)
            if (!matches.length) { await trx('concert_alert_digest').where('id',existing.id).update({status:'cancelled'}); return null }
            await trx('concert_alert_digest').where('id',existing.id).update({matches:JSON.stringify(matches)})
            return {...existing,matches}
          }
          const matches = await newMatches(trx, subscriber)
          if (!matches.length) return null
          const previous = await trx('concert_alert_digest').where({subscriber_id:id,day}).first()
          if (previous && previous.status !== 'cancelled') return null
          if (previous) {
            const [updated] = await trx('concert_alert_digest').where('id',previous.id).update({status:'pending',matches:JSON.stringify(matches),attempts:0,attempted_at:null}).returning('*')
            return updated
          }
          return (await trx('concert_alert_digest').insert({subscriber_id:id,day,matches:JSON.stringify(matches)}).returning('*'))[0]
        })
        if (!delivery) { stats.skipped++; continue }
        await reserveDigestAttempt(db, hourlyLimit)
        await db('concert_alert_digest').where('id',delivery.id).update({status:'sending',attempts:delivery.attempts+1,attempted_at:now})
        await db.transaction(async trx => {
          const subscriber = await trx('concert_alert_subscriber').where('id',id).forUpdate().first()
          const concerts = await renderMatches(trx, subscriber, delivery.matches)
          if (!concerts.length) { await trx('concert_alert_digest').where('id',delivery.id).update({status:'cancelled'}); return }
          const management = await ensureManagement(trx,subscriber)
          try { await send(digestMail(subscriber,concerts,origin,management,delivery.id)) }
          catch (error) {
            const kind=failureKind(error)
            await trx('concert_alert_digest').where('id',delivery.id).update({status:kind==='retry' && delivery.attempts<2?'pending':kind==='rejected'?'rejected':'held',failure_kind:kind})
            if (kind==='rejected') await trx('concert_alert').where({subscriber_id:id,status:'active'}).update({status:'suspended'})
            stats.failed++; return
          }
          await trx('concert_alert_delivered').insert(concerts.map(c=>({subscriber_id:id,concert_id:c.id}))).onConflict(['subscriber_id','concert_id']).ignore()
          await trx('concert_alert_seen').insert(concerts.flatMap(c=>c.alertIds.map(alert_id=>({alert_id,concert_id:c.id})))).onConflict(['alert_id','concert_id']).ignore()
          const acceptedMatches = delivery.matches.map(m=>({...m,concertIds:concerts.filter(c=>c.alertIds.some(a=>String(a)===String(m.alertId))).map(c=>c.id)})).filter(m=>m.concertIds.length)
          await trx('concert_alert_digest').where('id',delivery.id).update({status:'accepted',accepted_at:trx.fn.now(),matches:JSON.stringify(acceptedMatches)})
          await trx('concert_alert_subscriber').where('id',id).update({last_digest_day:day})
          stats.accepted++
        })
      } catch (error) {
        if (error.statusCode===429) break
        await db('concert_alert_digest').where({subscriber_id:id,status:'sending'}).update({status:'held',failure_kind:'processing'})
        stats.held++
      }
    }
    stats.pending=Number((await db('concert_alert_digest').where('status','pending').count('* as count').first()).count)
    stats.held=Number((await db('concert_alert_digest').where('status','held').count('* as count').first()).count)
    return stats
  } finally {
    try { await db.raw('SELECT pg_advisory_unlock(78239001)').connection(connection) }
    finally { await db.client.releaseConnection(connection) }
  }
}
