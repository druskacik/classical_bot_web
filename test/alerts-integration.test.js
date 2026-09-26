import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import knex from 'knex'
import { requestAlert, confirmAlert, saveAlert, listAlerts, getSubscriber, removeAlert, unsubscribe } from '../server/utils/alerts/service.js'
import { criteria } from '../server/utils/alerts/criteria.js'
import { runAlerts } from '../server/utils/alerts/worker.js'
import { hash, managementToken } from '../server/utils/alerts/core.js'
const url = process.env.ALERT_TEST_DATABASE_URL, schema = process.env.ALERT_TEST_SCHEMA_SQL
if (url) { assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname)); assert.equal(new URL(url).pathname,'/concert_alert_test') }
test('multiple alerts and combined delivery against disposable PostgreSQL', {skip:!url || !schema}, async t => {
  process.env.ALERTS_TOKEN_SECRET='local-test-only-'.repeat(4)
  const db=knex({client:'pg',connection:url}); t.after(()=>db.destroy())
  await db.raw('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
  await db.raw(await readFile(schema,'utf8'))
  await db.raw(`CREATE TABLE city (id bigint primary key, english_name text, local_name text, country_code text, latitude double precision, longitude double precision);
    CREATE TABLE classical_concert (id serial primary key, title text default 'Concert', url text default 'https://example.org/event', date date default (CURRENT_DATE + 30), time_from time, venue text, city_id bigint, city_raw text, country_code_resolved text, country_code_raw text, inclusion_status text default 'included', duplicate_of_id integer);
    CREATE TABLE composer (id serial primary key, name text);
    CREATE TABLE work (id serial primary key, title text, composer_id integer);
    CREATE TABLE classical_concert_work (classical_concert_id integer, work_id integer);
    CREATE TABLE classical_concert_composer (classical_concert_id integer, composer_id integer);`)
  await db('city').insert({id:1,english_name:'Prague',local_name:'Praha',country_code:'CZ',latitude:50.0755,longitude:14.4378})
  await db('composer').insert({id:1,name:'Beethoven'})
  const origin='https://classicalbot.com', messages=[]
  const send=async m=>messages.push(m)
  const now=new Date(); now.setUTCHours(12,0,0,0)
  const run=options=>runAlerts(db,{send,origin,now,...options})
  const add=async (patch={})=>(await db('classical_concert').insert({city_id:1,country_code_resolved:'CZ',...patch}).returning('id'))[0].id
  let seq=0
  const activate=async (query={country:'CZ'},email=`user${++seq}@example.org`)=>{
    await requestAlert(db,{email,criteria:query},send,origin)
    return confirmAlert(db,messages.at(-1).text.match(/confirm#([\w-]+)/)[1])
  }
  const reset=async()=>{ await db('concert_alert_digest').delete(); await db('concert_alert_subscriber').delete(); await db('concert_alert_rate').delete(); messages.length=0 }
  await t.test('independent confirmations, private management, duplicate prevention and ownership',async()=>{
    await add()
    const first=await activate({city:'1'},'one@example.org')
    await requestAlert(db,{email:'one@example.org',criteria:{country:'CZ'}},send,origin)
    const secondLink=messages.at(-1).text.match(/confirm#([\w-]+)/)[1]
    assert.match(messages.at(-1).html,/Manage alerts/)
    const third=await saveAlert(db,first.token,{composers:'Beethoven'})
    let list=await listAlerts(db,first.token)
    assert.equal(list.alerts.length,3); assert.equal(list.alerts.filter(a=>a.status==='pending').length,1)
    const second=await confirmAlert(db,secondLink)
    assert.equal(second.token,first.token)
    await assert.rejects(()=>confirmAlert(db,secondLink))
    const dup=await saveAlert(db,first.token,{country:'cz'})
    assert.equal(dup.duplicate,true); assert.equal(dup.alertId,second.alertId)
    const concurrent=await Promise.all([saveAlert(db,first.token,{country:'SK'}),saveAlert(db,first.token,{country:'SK'})])
    assert.equal(concurrent.filter(r=>r.duplicate).length,1)
    const other=await activate({country:'CZ'},'other@example.org')
    await assert.rejects(()=>saveAlert(db,other.token,{},first.alertId),e=>e.statusCode===404)
    await assert.rejects(()=>removeAlert(db,other.token,first.alertId),e=>e.statusCode===404)
    await removeAlert(db,first.token,third.alertId)
    list=await listAlerts(db,first.token); assert.equal(list.alerts.length,3)
    // Editing keeps old subscriber links valid and changes only the target.
    await saveAlert(db,first.token,{country:'DE'},first.alertId)
    assert.equal((await listAlerts(db,first.token)).alerts.find(a=>a.id===first.alertId).criteria.country,'DE')
    assert.equal((await listAlerts(db,first.token)).alerts.find(a=>a.id===second.alertId).criteria.country,'cz'.toUpperCase())
    await unsubscribe(db,first.token)
    assert.ok((await listAlerts(db,first.token)).alerts.every(a=>a.status==='unsubscribed'))
  })
  await reset()
  await t.test('managed saves reactivate unsubscribed and removed searches without duplicate rows',async()=>{
    const first=await activate({country:'CZ'})
    const subscriber=await getSubscriber(db,first.token)
    for (const removed of [false,true]) {
      if (removed) await removeAlert(db,first.token,first.alertId)
      else await unsubscribe(db,first.token)
      const fresh=await add()
      const before=await db('concert_alert').where('id',first.alertId).first()
      const results=await Promise.all([saveAlert(db,first.token,{country:'cz'}),saveAlert(db,first.token,{country:'CZ'})])
      assert.ok(results.every(result=>result.alertId===first.alertId))
      assert.equal(results.filter(result=>result.duplicate).length,1)
      const after=await db('concert_alert').where('id',first.alertId).first()
      assert.equal(after.status,'active'); assert.equal(after.removed_at,null)
      assert.equal(after.generation,before.generation+1)
      assert.ok(await db('concert_alert_seen').where({alert_id:first.alertId,concert_id:fresh}).first())
      assert.equal((await listAlerts(db,first.token)).alerts.length,1)
      assert.equal(Number((await db('concert_alert').where('subscriber_id',subscriber.id).count('* as count').first()).count),1)
      assert.equal((await run()).accepted,0)
    }
  })
  await reset()
  await t.test('public reactivation reuses the row but waits for a fresh confirmation',async()=>{
    const email='reactivation@example.org'
    const first=await activate({country:'CZ'},email)
    for (const removed of [false,true]) {
      if (removed) await removeAlert(db,first.token,first.alertId)
      else await unsubscribe(db,first.token)
      await requestAlert(db,{email,criteria:{country:'cz'}},send,origin)
      const link=messages.at(-1).text.match(/confirm#([\w-]+)/)[1]
      const waiting=await db('concert_alert').where('id',first.alertId).first()
      assert.equal(waiting.status,'unsubscribed')
      assert.equal(Boolean(waiting.removed_at),removed)
      assert.equal(Number((await db('concert_alert').count('* as count').first()).count),1)
      const fresh=await add()
      assert.equal((await run()).accepted,0)
      const confirmed=await confirmAlert(db,link)
      assert.equal(confirmed.alertId,first.alertId); assert.equal(confirmed.token,first.token)
      assert.equal((await listAlerts(db,first.token)).alerts[0].status,'active')
      assert.ok(await db('concert_alert_seen').where({alert_id:first.alertId,concert_id:fresh}).first())
      await assert.rejects(()=>confirmAlert(db,link))
    }
  })
  await reset()
  await t.test('removed and unsubscribed pending searches keep criteria for later reactivation',async()=>{
    for (const removed of [false,true]) {
      const email=`pending-${removed}@example.org`
      await requestAlert(db,{email,criteria:{country:'CZ'}},send,origin)
      const oldLink=messages.at(-1).text.match(/confirm#([\w-]+)/)[1]
      const access=messages.at(-1).text.match(/manage#([\w-]+)/)[1]
      const pending=(await listAlerts(db,access)).alerts[0]
      const duplicate=await saveAlert(db,access,{country:'CZ'})
      assert.equal(duplicate.duplicate,true); assert.equal(duplicate.alertId,pending.id)
      if (removed) await removeAlert(db,access,pending.id)
      else await unsubscribe(db,access)
      await assert.rejects(()=>confirmAlert(db,oldLink))
      const restored=await saveAlert(db,access,{country:'CZ'})
      assert.equal(restored.alertId,pending.id)
      assert.equal((await listAlerts(db,access)).alerts[0].status,'active')
    }
  })
  await reset()
  await t.test('editing into an inactive search restores it and retires the replaced search',async()=>{
    const first=await activate({country:'CZ'})
    await removeAlert(db,first.token,first.alertId)
    const second=await saveAlert(db,first.token,{country:'SK'})
    const result=await saveAlert(db,first.token,{country:'CZ'},second.alertId)
    assert.equal(result.alertId,first.alertId); assert.ok(!result.duplicate)
    const list=await listAlerts(db,first.token)
    assert.equal(list.alerts.length,1); assert.equal(list.alerts[0].id,first.alertId)
    assert.ok((await db('concert_alert').where('id',second.alertId).first()).removed_at)
    // Even if older historical duplicates exist, a live match always wins.
    await db('concert_alert').insert({email:list.email,subscriber_id:(await getSubscriber(db,first.token)).id,status:'unsubscribed',criteria:{country:'CZ'},summary:'Czechia'})
    const duplicate=await saveAlert(db,first.token,{country:'CZ'})
    assert.equal(duplicate.duplicate,true); assert.equal(duplicate.alertId,first.alertId)
  })
  await reset()
  await t.test('one digest, overlapping matches, baseline suppression and recipient delivery history',async()=>{
    const baseline=await add()
    const first=await activate({city:'1'})
    await saveAlert(db,first.token,{country:'CZ'})
    assert.equal((await run()).accepted,0)
    await add({inclusion_status:'quarantined'}); await add({duplicate_of_id:baseline})
    const fresh=await add()
    assert.equal((await run()).accepted,1)
    assert.match(messages.at(-1).subject,/^1 new concert/)
    assert.match(messages.at(-1).text,/Manage alerts:/)
    assert.match(messages.at(-1).text,/Unsubscribe from all:/)
    assert.equal((messages.at(-1).html.match(/<h2/g)||[]).length,1)
    assert.equal((await run()).accepted,0)
    const subscriber=await getSubscriber(db,first.token)
    assert.ok(await db('concert_alert_delivered').where({subscriber_id:subscriber.id,concert_id:fresh}).first())
    const late=await saveAlert(db,first.token,{composers:'Beethoven'})
    await db('classical_concert_composer').insert({classical_concert_id:fresh,composer_id:1})
    const tomorrow=new Date(now.valueOf()+86400_000)
    assert.equal((await run({now:tomorrow})).accepted,0)
    // Late enrichment of a never-delivered concert remains eligible for the new search.
    await db('classical_concert_composer').insert({classical_concert_id:baseline,composer_id:1})
    assert.equal((await run({now:tomorrow})).accepted,1)
    assert.ok(await db('concert_alert_seen').where({alert_id:late.alertId,concert_id:baseline}).first())
  })
  await reset()
  await t.test('overflow, canonical records, transient retries and expired alerts',async()=>{
    const first=await activate({country:'CZ'})
    for(let i=0;i<51;i++) await add()
    assert.equal((await run()).accepted,1); assert.match(messages.at(-1).subject,/^50 new concerts/)
    const tomorrow=new Date(now.valueOf()+86400_000)
    assert.equal((await run({now:tomorrow})).accepted,1); assert.match(messages.at(-1).subject,/^1 new concert/)
    const subscriber=await getSubscriber(db,first.token)
    const old=(await db('concert_alert_delivered').where('subscriber_id',subscriber.id).first()).concert_id
    const preferred=await add(); await db('classical_concert').where('id',old).update({duplicate_of_id:preferred})
    const later=new Date(now.valueOf()+2*86400_000)
    assert.equal((await run({now:later})).accepted,0)
    await add()
    assert.equal((await run({now:later,send:async()=>{throw {responseCode:450}}})).failed,1)
    assert.equal((await run({now:later})).accepted,0)
    assert.equal((await run({now:new Date(later.valueOf()+3600_000)})).accepted,1)
    await db('concert_alert').where('id',first.alertId).update({criteria:{dateTo:'2000-01-01'}})
    await run({now:new Date(later.valueOf()+86400_000)})
    assert.equal((await listAlerts(db,first.token)).alerts[0].status,'expired')
  })
  await reset()
  await t.test('held delivery blocks subscriber; unsubscribe invalidates pending confirmation',async()=>{
    const first=await activate({country:'CZ'},'held@example.org')
    await add()
    assert.equal((await run({send:async()=>{throw {code:'ETIMEDOUT',command:'CONN'}}})).failed,1)
    await saveAlert(db,first.token,{country:'CZ'})
    await add()
    let retried=false
    const later=new Date(now.valueOf()+86400_000)
    assert.equal((await run({now:later,send:async()=>{retried=true}})).accepted,0)
    assert.equal(retried,false)
    assert.equal((await db('concert_alert_digest').first()).status,'held')
    await requestAlert(db,{email:'held@example.org',criteria:{country:'SK'}},send,origin)
    const pending=messages.at(-1).text.match(/confirm#([\w-]+)/)[1]
    await unsubscribe(db,first.token)
    await assert.rejects(()=>confirmAlert(db,pending))
    assert.ok((await listAlerts(db,first.token)).alerts.every(a=>a.status==='unsubscribed'))
  })
  await reset()
  await t.test('edits rebuild definitely failed digests and unsubscribe serializes with SMTP',async()=>{
    const first=await activate({country:'CZ'})
    await add()
    assert.equal((await run({send:async()=>{throw {responseCode:450}}})).failed,1)
    await saveAlert(db,first.token,{country:'SK'},first.alertId)
    const fresh=await add({country_code_resolved:'SK',city_id:null,city_raw:'Bratislava'})
    let entered, release
    const started=new Promise(resolve=>{entered=resolve})
    const held=new Promise(resolve=>{release=resolve})
    const sending=run({now:new Date(now.valueOf()+3600_000),send:async mail=>{messages.push(mail);entered();await held}})
    await started
    let stopped=false
    const stopping=unsubscribe(db,first.token).then(()=>{stopped=true})
    // The row lock keeps unsubscribe queued until the in-flight send completes.
    await new Promise(resolve=>setTimeout(resolve,25))
    assert.equal(stopped,false)
    release(); assert.equal((await sending).accepted,1); await stopping
    assert.match(messages.at(-1).text,/Slovakia/)
    assert.ok(await db('concert_alert_delivered').where('concert_id',fresh).first())
    assert.equal((await listAlerts(db,first.token)).alerts[0].status,'unsubscribed')
    assert.equal((await run({now:new Date(now.valueOf()+86400_000)})).accepted,0)
  })
  await reset()
  await t.test('permanent recipient rejection suspends every active search',async()=>{
    const first=await activate({country:'CZ'})
    await saveAlert(db,first.token,{city:'1'})
    await add()
    assert.equal((await run({send:async()=>{throw {code:'EENVELOPE',command:'RCPT TO',responseCode:550}}})).failed,1)
    assert.ok((await listAlerts(db,first.token)).alerts.every(a=>a.status==='suspended'))
  })
  await reset()
  await t.test('permanent sender rejection holds the digest without suspending searches',async()=>{
    const first=await activate({country:'CZ'})
    await saveAlert(db,first.token,{city:'1'})
    await add()
    assert.equal((await run({send:async()=>{throw {code:'EENVELOPE',command:'MAIL FROM',responseCode:550}}})).failed,1)
    assert.ok((await listAlerts(db,first.token)).alerts.every(a=>a.status==='active'))
    assert.equal((await db('concert_alert_digest').first()).status,'held')
  })
  await reset()
  await t.test('cleanup preserves renewed confirmations and removes stale pending searches',async()=>{
    const email='renewed@example.org'
    await requestAlert(db,{email,criteria:{country:'CZ'}},send,origin)
    const original=await db('concert_alert').where({email}).first()
    await requestAlert(db,{email,criteria:{country:'SK'}},send,origin)
    const expired=(await db('concert_alert').where({email}).whereNot('id',original.id).first()).id
    await requestAlert(db,{email,criteria:{country:'DE'}},send,origin)
    const missing=(await db('concert_alert').where({email}).whereNotIn('id',[original.id,expired]).first()).id
    await db('concert_alert').where({email}).update({created_at:db.raw("now() - interval '8 days'"),confirmation_expires_at:db.raw("now() - interval '1 day'")})
    await db('concert_alert').where('id',missing).update({confirmation_hash:null,confirmation_expires_at:null})
    await db('concert_alert_rate').delete()
    await requestAlert(db,{email,criteria:{country:'CZ'}},send,origin)
    const link=messages.at(-1).text.match(/confirm#([\w-]+)/)[1]
    assert.equal((await db('concert_alert').where('confirmation_hash',hash(link)).first()).id,original.id)
    await run()
    assert.equal(await db('concert_alert').where('id',expired).first(),undefined)
    assert.equal(await db('concert_alert').where('id',missing).first(),undefined)
    assert.equal((await confirmAlert(db,link)).alertId,original.id)
  })
  await reset()
  await t.test('rolling hourly budget queues excess digests and counts failed attempts',async()=>{
    await activate({country:'CZ'})
    await activate({country:'CZ'})
    await activate({country:'CZ'})
    await add()
    messages.length=0
    assert.equal((await run({hourlyLimit:2})).accepted,2)
    assert.equal(messages.length,2)
    assert.equal(Number((await db('concert_alert_digest').where('status','pending').count('* as count').first()).count),1)
    assert.equal((await run({hourlyLimit:2})).accepted,0)
    // A new Prague day does not reset the rolling-hour budget.
    assert.equal((await run({hourlyLimit:2,now:new Date(now.valueOf()+86400_000)})).accepted,0)
    const slots=await db('concert_alert_rate').whereLike('key','digest-attempt:%').orderBy('key')
    assert.equal(slots.length,2)
    await db('concert_alert_rate').where('key',slots[0].key).update({expires_at:db.raw("now() - interval '1 second'")})
    assert.equal((await run({hourlyLimit:2,send:async()=>{throw {responseCode:450}}})).failed,1)
    assert.equal((await run({hourlyLimit:2,now:new Date(now.valueOf()+3600_000)})).accepted,0)
    await db('concert_alert_rate').whereLike('key','digest-attempt:%').update({expires_at:db.raw("now() - interval '1 second'")})
    assert.equal((await run({hourlyLimit:2,now:new Date(now.valueOf()+3600_000)})).accepted,1)
    assert.equal(messages.length,3)
    assert.equal((await run({hourlyLimit:2,now:new Date(now.valueOf()+3600_000)})).accepted,0)
  })
  await reset()
  await t.test('legacy management aliases, pagination and worker exclusion',async()=>{
    const first=await activate({country:'CZ'})
    const legacy=managementToken({id:first.alertId,generation:1})
    await db('concert_alert').where('id',first.alertId).update({management_hash:hash(legacy)})
    assert.equal((await getSubscriber(db,legacy)).id,(await getSubscriber(db,first.token)).id)
    const subscriber=await getSubscriber(db,first.token)
    await db('concert_alert').insert(Array.from({length:51},(_,i)=>({email:subscriber.email,subscriber_id:subscriber.id,status:'expired',criteria:{},summary:`Search ${i}`})))
    const page=await listAlerts(db,legacy); assert.equal(page.alerts.length,50); assert.equal(page.nextOffset,50)
    assert.equal((await listAlerts(db,legacy,50)).alerts.length,2)
    const connection=await db.client.acquireConnection()
    await db.raw('SELECT pg_advisory_lock(78239001)').connection(connection)
    try {assert.equal((await run()).skipped,'locked')} finally {await db.raw('SELECT pg_advisory_unlock(78239001)').connection(connection);await db.client.releaseConnection(connection)}
    const selected=await criteria(db,{city:'1',radius:'50'})
    assert.deepEqual(selected.query,{city:'1',radius:'50'})
    await assert.rejects(()=>criteria(db,{bounds:'1,2,3,4'}))
  })
})
