import { Resolver } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'
import { fail, normalizeUrl } from './contract.js'
import { resolveSource } from './resolve-source.js'

export function submittedUrl(value) {
  normalizeUrl(value) // Apply the same syntax and credential checks as lookup.
  const url = new URL(value.trim().includes('://') ? value.trim() : `https://${value.trim()}`)
  url.hash = ''
  return url.href
}

async function resolveAddresses(hostname) {
  const resolver = new Resolver({ timeout: 2500, tries: 1 })
  try {
    const results = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)])
    const transient = results.find(r => r.status === 'rejected' && !['ENODATA', 'ENOTFOUND'].includes(r.reason.code))
    if (transient) throw transient.reason
    return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  } finally { resolver.cancel() }
}

export async function validateWebsite(value, { resolve = resolveAddresses, timeout = 3000 } = {}) {
  const url = new URL(submittedUrl(value))
  const host = url.hostname.replace(/\.$/, '')
  const reserved = /(^|\.)(localhost|local|internal|invalid|test|example|onion|home|lan|arpa)$/i
  if (url.port || ipaddr.isValid(host.replace(/^\[|\]$/g, '')) || !host.includes('.') || reserved.test(host)
      || host.length > 253 || host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    throw fail(422, 'invalid_website', 'Supply a public organisation website on a standard HTTP(S) port.')
  }
  let timer
  try {
    const addresses = await Promise.race([
      resolve(host),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), timeout) }),
    ])
    if (!addresses.length || addresses.some(address => !ipaddr.isValid(address) || ipaddr.parse(address).range() !== 'unicast')) {
      throw fail(422, 'invalid_website', 'The website must resolve only to public IP addresses.')
    }
  } catch (error) {
    if (error.statusCode) throw error
    if (['ENOTFOUND', 'ENODATA'].includes(error.code)) throw fail(422, 'invalid_website', 'The website hostname does not exist.')
    throw fail(503, 'dns_unavailable', 'Unable to validate the website right now. Try again later.')
  } finally { clearTimeout(timer) }
}

export function positiveSetting(env, name, fallback) {
  const value = env[name]
  if (value === undefined || value === '') return fallback
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid ${name}`)
  return Number(value)
}

export function createSubmissionLimiter({ limit = 5, now = Date.now } = {}) {
  const clients = new Map()
  return ip => {
    const time = now()
    for (const [key, bucket] of clients) if (bucket.expires <= time) clients.delete(key)
    const bucket = clients.get(ip) || { count: 0, expires: time + 3600000 }
    if (bucket.count >= limit || (!clients.has(ip) && clients.size >= 10000)) {
      throw fail(429, 'rate_limited', 'Too many website submissions.', { retry_after: Math.max(1, Math.ceil((bucket.expires - time) / 1000)) })
    }
    bucket.count++
    clients.set(ip, bucket)
  }
}

export async function lookupSource(db, url) {
  const sources = await db('crawler_source').select('id', 'canonical_url', 'duplicate_of_id', 'status', 'next_attempt_at')
  const aliases = await db('crawler_source_url').select('crawler_source_id', 'url')
  const resolved = resolveSource(url, sources, aliases)
  const row = sources.find(source => String(source.id) === resolved.id)
  return { ...resolved, status: row.status, next_attempt_at: row.next_attempt_at ? new Date(row.next_attempt_at).toISOString() : null }
}

export async function registerSource(db, input, dailyLimit = 50) {
  try {
    return await db.transaction(async trx => {
      await trx.raw("SET LOCAL statement_timeout = '10s'")
      await trx.raw("SELECT pg_advisory_xact_lock(hashtext('business-api-source-registration'))")
      try { return await lookupSource(trx, input.url) }
      catch (error) { if (error.code !== 'source_not_found') throw error }
      const { count } = await trx('crawler_source as s').whereRaw("s.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'")
        .whereExists(trx('crawler_source_url as u').select(trx.raw('1')).whereRaw('u.crawler_source_id = s.id').where('u.discovered_by', 'business_api'))
        .count('* as count').first()
      if (Number(count) >= dailyLimit) {
        const now = new Date()
        const retry = Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000)
        throw fail(429, 'submission_limit', 'The daily website submission limit has been reached.', { retry_after: retry })
      }
      const canonical = submittedUrl(input.submittedUrl || input.url)
      const [source] = await trx('crawler_source').insert({ canonical_url: canonical, status: 'pending', priority: 100, geographic_scope: 'unknown' }).returning('id')
      await trx('crawler_source_url').insert({ crawler_source_id: source.id, url: canonical, normalized_url: input.url, role: 'submitted', discovered_by: 'business_api', metadata_json: {} })
      return { id: String(source.id), url: canonical, aliases: [input.url], status: 'pending', next_attempt_at: null }
    })
  } catch (error) {
    // Another registry writer may have won the unique normalized-URL constraint.
    if (error.code === '23505') return lookupSource(db, input.url)
    throw error
  }
}

export function createSourceOnboarding(db, { env = process.env, validate = validateWebsite, limiter = createSubmissionLimiter({ limit: positiveSetting(env, 'BUSINESS_API_SUBMISSIONS_PER_IP_HOUR', 5) }) } = {}) {
  const dailyLimit = positiveSetting(env, 'BUSINESS_API_SUBMISSIONS_PER_DAY', 50)
  return async (input, ip) => {
    try { return await lookupSource(db, input.url) }
    catch (error) { if (error.code !== 'source_not_found') throw error }
    if (env.BUSINESS_API_REGISTRATION_ENABLED !== 'true') throw fail(404, 'source_not_found', 'This organisation is not registered.')
    limiter(ip)
    await validate(input.submittedUrl || input.url)
    return registerSource(db, input, dailyLimit)
  }
}
