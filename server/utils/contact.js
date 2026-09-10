import { isIP } from 'node:net'
import { createError } from 'h3'

export const MAX_BODY_BYTES = 32 * 1024
const singleLine = (value) => typeof value === 'string' && !/[\r\n\x00-\x1f\x7f]/.test(value)
const email = (value) => singleLine(value) && value.length <= 254 && /^[^\s<>@,;:]+@[^\s<>@,;:]+\.[^\s<>@,;:]+$/.test(value)

export function validateContact(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid form submission' })
  }
  // Silently discard bots without confirming which check caught them.
  if (typeof body.website === 'string' && body.website.trim()) return null
  const errors = {}
  if (!singleLine(body.name) || !body.name.trim() || body.name.trim().length > 100) errors.name = 'Enter your name (up to 100 characters).'
  if (typeof body.email !== 'string' || !email(body.email.trim())) errors.email = 'Enter a valid email address.'
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.trim().length > 5000 || /\x00/.test(body.message)) errors.message = 'Enter a message (up to 5,000 characters).'
  if (Object.keys(errors).length) throw createError({ statusCode: 400, statusMessage: 'Check the highlighted fields', data: { fields: errors } })
  return { name: body.name.trim(), email: body.email.trim(), message: body.message.trim() }
}

export function smtpSettings(env = process.env) {
  const port = Number(env.SMTP_PORT || 587)
  const secureValue = env.SMTP_SECURE ?? String(port === 465)
  const from = env.SMTP_FROM?.trim() || 'ClassicalBot'
  const match = from.match(/^([^<>]+)<([^<>]+)>$/)
  const sender = match ? { name: match[1].trim(), address: match[2].trim() }
    : email(from) ? { name: 'ClassicalBot', address: from }
      : { name: from, address: env.SMTP_USER }
  const to = env.SMTP_TO?.trim() || env.SMTP_USER
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !Number.isInteger(port) || port < 1 || port > 65535
    || !['true', 'false'].includes(secureValue) || !singleLine(sender.name) || !email(sender.address) || !email(to)) {
    throw new Error('Invalid SMTP configuration')
  }
  return {
    transport: {
      host: env.SMTP_HOST, port, secure: secureValue === 'true', requireTLS: secureValue === 'false',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true,
      logger: false, debug: false,
    },
    from: sender, to,
  }
}

export function contactMail(settings, contact) {
  return {
    from: settings.from, to: settings.to,
    replyTo: { name: contact.name, address: contact.email },
    subject: 'ClassicalBot contact form',
    text: `Name: ${contact.name}\nEmail: ${contact.email}\n\n${contact.message}`,
    disableFileAccess: true, disableUrlAccess: true,
  }
}

// Trust forwarded addresses only with an exact proxy hop count and no direct
// public access to the app port. Work from the right, ignoring spoofed prefixes.
export function contactClientIP(peer, forwarded, hops = '0') {
  const count = Number(hops)
  if (!Number.isInteger(count) || count < 0 || count > 10) throw new Error('Invalid proxy configuration')
  if (!count) return peer || 'unknown'
  const chain = (forwarded || '').split(',').map(value => value.trim())
  const candidate = chain[chain.length - count]
  return candidate && isIP(candidate) ? candidate : peer || 'unknown'
}

export function createContactLimiter(now = Date.now) {
  const clients = new Map()
  let global = { count: 0, expires: 0 }
  let active = 0
  return {
    attempt(ip) {
      const time = now()
      for (const [key, value] of clients) if (value.expires <= time) clients.delete(key)
      const bucket = clients.get(ip) || { count: 0, expires: time + 15 * 60 * 1000 }
      if (bucket.count >= 5 || (!clients.has(ip) && clients.size >= 10000)) return Math.max(1, Math.ceil((bucket.expires - time) / 1000))
      bucket.count++
      clients.set(ip, bucket)
      return 0
    },
    reserve() {
      const time = now()
      if (global.expires <= time) global = { count: 0, expires: time + 60 * 60 * 1000 }
      if (global.count >= 30) return Math.max(1, Math.ceil((global.expires - time) / 1000))
      if (active >= 3) return 30
      global.count++
      active++
      return 0
    },
    release() { active = Math.max(0, active - 1) },
  }
}

// Count actual streamed bytes, including requests without Content-Length.
export function readContactBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    const finish = (error, value) => {
      clearTimeout(timer)
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('aborted', onError)
      if (error) { req.resume(); reject(error) } else resolve(value)
    }
    const onError = () => finish(createError({ statusCode: 400, statusMessage: 'Could not read form submission' }))
    const onData = (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) return finish(createError({ statusCode: 413, statusMessage: 'Message is too large' }))
      chunks.push(chunk)
    }
    const onEnd = () => {
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { finish(createError({ statusCode: 400, statusMessage: 'Invalid form submission' })) }
    }
    const timer = setTimeout(() => finish(createError({ statusCode: 408, statusMessage: 'Form submission timed out' })), 10000)
    req.on('data', onData).once('end', onEnd).once('error', onError).once('aborted', onError)
  })
}
