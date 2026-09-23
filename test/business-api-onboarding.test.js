import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createApp, toNodeListener } from 'h3'
import { validateWebsite, submittedUrl, createSubmissionLimiter } from '../server/utils/business-api/onboarding.js'
import { createConcertApiHandler } from '../server/utils/business-api/handler.js'
import { createDataCache } from '../layers/concerts/server/utils/data-cache.js'

test('website validation requires public DNS and preserves submitted protocol', async () => {
  assert.equal(submittedUrl('http://www.example.com/path#fragment'), 'http://www.example.com/path')
  const publicDns = async () => ['93.184.216.34', '2606:4700:4700::1111']
  for (const url of ['example.com', 'https://www.example.com', 'http://example.com:80']) await validateWebsite(url, {resolve:publicDns})
  for (const url of ['localhost', 'https://x.local', 'https://x.test', 'http://127.0.0.1', 'http://[::1]', 'https://example.com:1234', 'https://bad_name.com']) {
    await assert.rejects(validateWebsite(url, {resolve:publicDns}), {statusCode:422})
  }
  for (const addresses of [[], ['127.0.0.1'], ['10.1.1.1'], ['169.254.169.254'], ['::1'], ['fc00::1'], ['::ffff:8.8.8.8'], ['192.0.2.1'], ['93.184.216.34','192.168.0.1']]) {
    await assert.rejects(validateWebsite('example.com', {resolve:async()=>addresses}), {statusCode:422})
  }
  await assert.rejects(validateWebsite('example.com',{resolve:async()=>{throw Object.assign(new Error(),{code:'ENOTFOUND'})}}),{statusCode:422})
  await assert.rejects(validateWebsite('example.com',{resolve:async()=>{throw new Error()}}),{statusCode:503})
  await assert.rejects(validateWebsite('example.com',{resolve:()=>new Promise(()=>{}),timeout:5}),{statusCode:503})
})

test('submission limits count attempts, isolate clients and expire', () => {
  let now=0
  const attempt=createSubmissionLimiter({now:()=>now,limit:2})
  attempt('a');attempt('a');attempt('b')
  assert.throws(()=>attempt('a'),{statusCode:429})
  now=3600000;attempt('a')
})

test('HTTP polling reads live registry state while sharing cached concerts', async t => {
  let state='pending', total=0, calls=0
  const handler=createConcertApiHandler({
    prepare:async()=>({status:state,next_attempt_at:null}),log:()=>{},env:{},
    cache:createDataCache({enabled:()=>true}),
    load:async()=>{calls++;return {source:{id:'1',name:'Website',url:'http://example.com'},concerts:[],pagination:{total,total_pages:0,page:1,page_size:50,all:false},generated_at:new Date().toISOString()}},
  })
  const server=createServer(toNodeListener(createApp().use(handler)))
  server.listen(0,'127.0.0.1');await once(server,'listening')
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
  const base=`http://127.0.0.1:${server.address().port}/?url=example.com&format=csv`
  for (const status of ['pending','processing','pr_open','retry_wait','blocked','disabled','needs_attention']) {
    state=status
    const response=await fetch(base)
    assert.equal(response.status,['blocked','disabled','needs_attention'].includes(state)?200:202)
    assert.equal(response.headers.get('x-source-status'),state)
    assert.match(response.headers.get('content-type'),/application\/json/)
    const body=await response.json()
    assert.equal(body.source.status,state)
    assert.equal(body.pagination.next,null)
  }
  assert.equal(calls,1)
  state='active'
  const response=await fetch(base)
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/)
  total=1;state='processing'
  const populated=await fetch(base+'&page=2') // Separate data-cache key.
  assert.equal(populated.status,200);assert.match(populated.headers.get('content-type'),/text\/csv/)
})
