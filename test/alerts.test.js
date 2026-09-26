import test from 'node:test'
import assert from 'node:assert/strict'
import { alertDay, failureKind, digestMail, normalizeEmail, token, tokenHash, managementToken } from '../server/utils/alerts/core.js'

test('email and management tokens reject injection and malformed input', () => {
  assert.equal(normalizeEmail(' User@Example.org '), 'user@example.org')
  for (const email of ['a@b.c\nBcc:x@y.z', 'a@b.c,c@d.e', null, 'not-email']) assert.throws(() => normalizeEmail(email))
  assert.equal(tokenHash(token()).length, 64)
  assert.throws(() => tokenHash('short'))
  const key = 'test'.repeat(8)
  assert.notEqual(managementToken({ id: 1, generation: 1 }, key), managementToken({ id: 1, generation: 2 }, key))
  assert.throws(() => managementToken({ id: 1, generation: 1 }, 'short'))
})
test('daily delivery follows Prague daylight saving time', () => {
  assert.deepEqual(alertDay(new Date('2026-01-01T06:59Z')), { day: '2026-01-01', due: false })
  assert.deepEqual(alertDay(new Date('2026-01-01T07:00Z')), { day: '2026-01-01', due: true })
  assert.deepEqual(alertDay(new Date('2026-07-01T06:00Z')), { day: '2026-07-01', due: true })
  assert.deepEqual(alertDay(new Date('2026-03-29T05:59Z')), { day: '2026-03-29', due: false })
})
test('SMTP ambiguous outcomes are held rather than resent', () => {
  assert.equal(failureKind({ code: 'ETIMEDOUT', command: 'DATA' }), 'held')
  assert.equal(failureKind({ code: 'ESOCKET', command: 'CONN' }), 'retry')
  assert.equal(failureKind({ responseCode: 450 }), 'retry')
  assert.equal(failureKind({ code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 }), 'rejected')
  assert.equal(failureKind({ code: 'EENVELOPE', command: 'MAIL FROM', responseCode: 550 }), 'held')
  assert.equal(failureKind({ code: 'EENVELOPE', command: 'DATA', responseCode: 550 }), 'held')
  assert.equal(failureKind({ code: 'EENVELOPE', responseCode: 550 }), 'held')
})
test('digest escapes programme data and excludes unsafe links', () => {
  const mail = digestMail({ email: 'one@example.org', summary: '<Bach>' }, [{ title: '<script>x</script>', id: 1, date: '2026-12-01', url: 'javascript:alert(1)', programme: 'A & B' }], 'https://classicalbot.com', 'secret', 1)
  assert.ok(mail.text.includes('A & B'))
  assert.ok(mail.html.includes('&lt;script&gt;'))
  assert.ok(!mail.html.includes('javascript:'))
  assert.ok(mail.html.includes('/alerts/manage#secret'))
  assert.equal(mail.to, 'one@example.org')
  assert.equal(mail.messageId, '<digest-1@classicalbot.com>')
})

test('subscriber access is stable and domain-separated from legacy alert tokens', async () => {
  const { subscriberToken, confirmationMail } = await import('../server/utils/alerts/core.js')
  const key='test'.repeat(8), subscriber={id:1,generation:0}
  assert.notEqual(subscriberToken(subscriber,key),managementToken(subscriber,key))
  assert.equal(subscriberToken(subscriber,key),subscriberToken({...subscriber,criteria:{country:'CZ'}},key))
  const mail=confirmationMail('one@example.org','<Bach>','https://classicalbot.com','confirm-token','manage-token')
  assert.match(mail.html,/&lt;Bach&gt;/)
  assert.match(mail.html,/Manage alerts/)
  assert.match(mail.text,/Manage alerts: https:\/\/classicalbot.com\/alerts\/manage#manage-token/)
  const duplicate=confirmationMail('one@example.org','Bach','https://classicalbot.com','unused','manage-token',true)
  assert.match(duplicate.text,/already have this alert/)
  assert.ok(!duplicate.html.includes('/alerts/confirm'))
})


test('saved radius alerts retain their location through shared query parsing', async () => {
  const { criteria } = await import('../server/utils/alerts/criteria.js')
  const cities = [{ id: 1, english_name: 'Prague', local_name: 'Praha', country_code: 'CZ', latitude: 50.08, longitude: 14.43 }]
  const db = table => {
    assert.equal(table, 'city')
    return { select: async () => cities }
  }
  for (const input of [{ city: 'Prague,CZ', radius: '50' }, { nearCity: '1', radiusKm: '50' }]) {
    const saved = await criteria(db, input)
    assert.deepEqual(saved.query, { city: '1', radius: '50' })
    const restored = await criteria(db, saved.query)
    assert.deepEqual(restored.filters.area, { ...saved.filters.area, origin: '1' })
    assert.deepEqual(restored.filters.area.cityIds, ['1'])
    assert.match(restored.summary, /Prague.*50 km/)
  }
})

test('saving alerts rejects semantically empty filters while previews and existing alerts remain readable', async () => {
  const { criteria } = await import('../server/utils/alerts/criteria.js')
  const db = () => { throw new Error('Empty criteria must not query the database') }
  for (const input of [{}, { page: '2' }, { city: ' ', composers: ' , ', works: ',' }, { radius: '0' }, { datePreset: 'week' }]) {
    await assert.rejects(criteria(db, input, { requireFilter: true }), error => error.statusCode === 400 && error.statusMessage === 'Choose at least one filter before saving an alert.')
  }
  assert.equal((await criteria(db, {})).summary, 'Worldwide · Any upcoming date')
  assert.equal((await criteria(db, {}, { allowExpired: true })).summary, 'Worldwide · Any upcoming date')
  for (const input of [{ country: 'AT' }, { city: 'Vienna' }, { composers: 'Bach' }, { dateFrom: '2099-10-01' }]) {
    assert.ok((await criteria(db, input, { requireFilter: true })).summary)
  }
})
