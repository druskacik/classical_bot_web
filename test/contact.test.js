import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, request } from 'node:http'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import nodemailer from 'nodemailer'
import { createApp, createRouter, toNodeListener } from 'h3'
import { contactClientIP, contactMail, createContactLimiter, MAX_BODY_BYTES, readContactBody, smtpSettings, validateContact } from '../server/utils/contact.js'
import { createContactHandler } from '../server/utils/contact-handler.js'

const env = { NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'contact@example.com', SMTP_PASS: 'test-password', SMTP_FROM: 'ClassicalBot' }
const form = { name: 'A Visitor', email: 'visitor@example.org', message: 'Please add this concert source.', website: '' }

test('validates content and rejects header injection, lists, and oversized fields', () => {
  assert.deepEqual(validateContact({ ...form, name: ' A Visitor ' }), formWithoutTrap())
  for (const patch of [{ name: '\r\nBcc: victim@example.com' }, { email: 'a@example.com,b@example.com' }, { email: { trim: 'bad' } }, { message: ' ' }, { message: 'x'.repeat(5001) }, { name: 'x'.repeat(101) }]) {
    assert.throws(() => validateContact({ ...form, ...patch }), { statusCode: 400 })
  }
  for (const body of [null, [], 'text']) assert.throws(() => validateContact(body), { statusCode: 400 })
  assert.equal(validateContact({ website: 'https://spam.example' }), null)
})
function formWithoutTrap() { const { website, ...fields } = form; return fields }

test('SMTP uses authenticated sender, fixed recipient, Reply-To, and required TLS', () => {
  const settings = smtpSettings(env)
  assert.deepEqual(settings.from, { name: 'ClassicalBot', address: env.SMTP_USER })
  assert.equal(settings.to, env.SMTP_USER)
  assert.equal(settings.transport.requireTLS, true)
  assert.equal(settings.transport.secure, false)
  assert.equal(smtpSettings({ ...env, SMTP_PORT: '465', SMTP_SECURE: 'true' }).transport.secure, true)
  const explicit = smtpSettings({ ...env, SMTP_FROM: 'Project <sender@example.com>', SMTP_TO: 'inbox@example.com' })
  const mail = contactMail(explicit, { ...form, to: 'attacker@example.com', from: 'attacker@example.com' })
  assert.deepEqual(mail.from, { name: 'Project', address: 'sender@example.com' })
  assert.equal(mail.to, 'inbox@example.com')
  assert.deepEqual(mail.replyTo, { name: form.name, address: form.email })
  assert.equal(mail.html, undefined)
  for (const patch of [{ SMTP_PASS: '' }, { SMTP_PORT: 'NaN' }, { SMTP_SECURE: 'yes' }, { SMTP_TO: 'a@example.com,b@example.com' }, { SMTP_FROM: 'Bad\r\nSender' }]) assert.throws(() => smtpSettings({ ...env, ...patch }))
})

test('proxy trust is explicit and ignores spoofed leading addresses', () => {
  assert.equal(contactClientIP('127.0.0.1', '192.0.2.1'), '127.0.0.1')
  assert.equal(contactClientIP('127.0.0.1', '192.0.2.1, 198.51.100.2', '1'), '198.51.100.2')
  assert.equal(contactClientIP('127.0.0.1', 'bad', '1'), '127.0.0.1')
  assert.throws(() => contactClientIP('127.0.0.1', '', '-1'))
})

test('Nodemailer serializes the authenticated From and visitor Reply-To separately', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
  const result = await transport.sendMail(contactMail(smtpSettings(env), form))
  const raw = result.message.toString()
  assert.match(raw, /^From: ClassicalBot <contact@example.com>\r?$/m)
  assert.match(raw, /^To: contact@example.com\r?$/m)
  assert.match(raw, /^Reply-To: A Visitor <visitor@example.org>\r?$/m)
  assert.deepEqual(result.envelope, { from: 'contact@example.com', to: ['contact@example.com'] })
})

test('limits clients, total send attempts, and concurrent sends; expires windows', () => {
  let time = 1000
  const limiter = createContactLimiter(() => time)
  for (let i = 0; i < 5; i++) assert.equal(limiter.attempt('a'), 0)
  assert.equal(limiter.attempt('a'), 900)
  assert.equal(limiter.attempt('b'), 0)
  for (let i = 0; i < 3; i++) assert.equal(limiter.reserve(), 0)
  assert.equal(limiter.reserve(), 30)
  for (let i = 0; i < 3; i++) limiter.release()
  for (let i = 3; i < 30; i++) { assert.equal(limiter.reserve(), 0); limiter.release() }
  assert.equal(limiter.reserve(), 3600)
  time += 3600001
  assert.equal(limiter.attempt('a'), 0)
  assert.equal(limiter.reserve(), 0)
})

test('streaming body reader bounds actual bytes and rejects malformed JSON', async () => {
  for (const [data, statusCode] of [['{', 400], ['x'.repeat(MAX_BODY_BYTES + 1), 413]]) {
    const stream = new PassThrough()
    const result = readContactBody(stream)
    stream.end(data)
    await assert.rejects(result, { statusCode })
  }
})

async function start(t, options = {}) {
  const sent = []
  const app = createApp()
  app.use(createRouter().post('/api/contact', createContactHandler({ env, createTransport: () => ({
    async sendMail(mail) { sent.push(mail); return { accepted: [env.SMTP_USER], rejected: [] } }, close() {},
  }), ...options })))
  const server = createServer(toNodeListener(app))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const url = `http://127.0.0.1:${server.address().port}/api/contact`
  const post = (body = form, headers = {}) => fetch(url, { method: 'POST', headers: { origin: 'https://classicalbot.com', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { sent, post, url }
}

test('HTTP route delivers only valid messages and returns no SMTP internals', async t => {
  const { post, sent, url } = await start(t)
  assert.equal((await fetch(url)).status, 404)
  assert.equal((await post(form, { origin: 'https://attacker.example' })).status, 403)
  assert.equal((await post(form, { origin: '' })).status, 403)
  assert.equal((await post(form, { 'content-type': 'text/plain' })).status, 415)
  const invalid = await post({ ...form, email: 'bad' })
  assert.equal(invalid.status, 400)
  assert.equal(typeof (await invalid.json()).data.fields.email, 'string')
  assert.equal((await post({ ...form, website: 'spam' })).status, 200)
  assert.equal(sent.length, 0)
  const response = await post({ ...form, to: 'attacker@example.com' })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, env.SMTP_USER)
})

test('HTTP rate limiting cannot be bypassed by changing forwarded headers', async t => {
  const { post } = await start(t)
  for (let i = 0; i < 5; i++) assert.equal((await post({ website: 'bot' }, { 'x-forwarded-for': `192.0.2.${i}` })).status, 200)
  const response = await post(form, { 'x-forwarded-for': '192.0.2.99' })
  assert.equal(response.status, 429)
  assert.ok(Number(response.headers.get('retry-after')) > 0)
})

test('chunked oversized requests return 413 without invoking SMTP', async t => {
  const { url, sent } = await start(t)
  const status = await new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { origin: 'https://classicalbot.com', 'content-type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject)
    req.write('x'.repeat(MAX_BODY_BYTES))
    req.end('x')
  })
  assert.equal(status, 413)
  assert.equal(sent.length, 0)
})

test('SMTP failure and rejection return a safe error and release concurrency', async t => {
  let attempts = 0
  const { post } = await start(t, { createTransport: () => ({
    async sendMail() { attempts++; if (attempts === 1) throw new Error('secret test-password'); return { accepted: [], rejected: ['private@example.com'] } }, close() {},
  }) })
  for (let i = 0; i < 4; i++) {
    const response = await post()
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /test-password|private@example.com/)
  }
  assert.equal(attempts, 4)
})

test('missing settings fail closed without creating an SMTP transport', async t => {
  const { post } = await start(t, { env: {}, createTransport() { assert.fail('must not connect') } })
  assert.equal((await post()).status, 503)
})
