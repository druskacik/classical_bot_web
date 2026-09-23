import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createApp, toNodeListener } from 'h3'
import { fields, parseInput, normalizeUrl, serializeCsv, assertExportSize, fail } from '../server/utils/business-api/contract.js'
import { resolveSource } from '../server/utils/business-api/resolve-source.js'
import { serializeConcert } from '../server/utils/business-api/serialize-concert.js'
import { createLimiter } from '../server/utils/business-api/limiter.js'
import { createConcertApiHandler } from '../server/utils/business-api/handler.js'
import { createDataCache } from '../layers/concerts/server/utils/data-cache.js'

// Independent CSV reader: exercise quoted fields, embedded newlines and JSON rather than splitting lines.
function parseCsv(text) {
  const rows = [], row = []
  let cell = '', quoted = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (c === ',' && !quoted) { row.push(cell); cell = '' }
    else if (c === '\r' && text[i + 1] === '\n' && !quoted) { row.push(cell); rows.push([...row]); row.length = 0; cell = ''; i++ }
    else cell += c
  }
  assert.equal(quoted, false)
  return rows
}

test('input validation and normalisation retain meaningful URL identity', () => {
  assert.equal(normalizeUrl(' HTTP://WWW.Example.com:80/Case?q=A#fragment '), 'https://example.com/Case?q=A')
  assert.equal(normalizeUrl('example.com'), 'https://example.com/')
  for (const url of ['ftp://example.com', 'https://u:p@example.com', '']) assert.throws(() => parseInput({ url }), { statusCode: 400 })
  for (const extra of [{ format:'xml' }, { all:'yes' }, { page:'0' }, { page_size:'101' }, { page: ['1','2'] }, { all:'true',page:'1' }, { city:'Prague' }]) {
    assert.throws(() => parseInput({url:'example.com', ...extra}), {statusCode:400})
  }
  assert.equal(parseInput({url:'example.com',all:'true',format:'csv'}).all, true)
})

test('source resolution handles aliases, merged sources, ambiguity and cycles', () => {
  const sources = [{id:1,canonical_url:'https://example.com/A'}, {id:2,canonical_url:'https://example.com/B'}, {id:3,canonical_url:'http://old.example/',duplicate_of_id:1}]
  const aliases = [{crawler_source_id:3,url:'https://alias.example/'}]
  assert.equal(resolveSource('https://alias.example/',sources,aliases).id,'1')
  assert.equal(resolveSource('https://example.com/A',sources,aliases).id,'1')
  assert.throws(() => resolveSource('https://example.com/',sources,aliases), {code:'ambiguous_source'})
  assert.throws(() => resolveSource('https://unknown.example/',sources,aliases), {code:'source_not_found'})
  assert.equal(resolveSource('https://alias.example/concerts',sources,aliases).id,'1')
  assert.throws(() => resolveSource('https://cycle.example/',[{id:1,canonical_url:'https://cycle.example/',duplicate_of_id:1}],[]), {code:'source_not_found'})
})

function sample() {
  return serializeConcert({id:1,title:'A "concert",\nwith music',date:'2026-11-01',time_from:'19:30:00',venue:'Hall',country_code:'CZ'}, {id:'2',name:'Orchestra',url:'https://example.com'}, {
    performers:[{id:'9007199254740993',name:'Éva, "Soloist"',kind:'person',roles:['soloist'],instruments:['violin'],voice_type:null,character_name:null,ensemble_id:null,qualifier:null,identity_url:null}],
    works:[{id:8,title:'Symphony',programme_label:'Symphony (excerpt)',catalogue_number:null,composer_id:2,composer_name:'Composer'}],
    composers:[{id:3,name:'Other Composer'}],
    prices:[{id:1,kind:'range',price_type:'admission',amount:'12.5000',amount_max:'30.0000',currency:'EUR',category:'Balcony',audience:'Students',conditions:'With ID',basis:'per person'}],sourceUrls:['https://example.com/event'],
  })
}

test('shared fields preserve detailed data and readable summaries in CSV', () => {
  const concert = sample()
  assert.deepEqual(Object.keys(concert), fields)
  assert.equal(concert.performers[0].id,'9007199254740993')
  assert.equal(concert.composers.length,2)
  assert.match(concert.prices,/12.5000–30.0000 EUR.*Students.*With ID/)
  assert.equal(concert.state,null)
  const [headers, values] = parseCsv(serializeCsv([concert]))
  assert.deepEqual(headers,fields)
  fields.forEach((key,i) => {
    const expected = concert[key]
    assert.deepEqual(Array.isArray(expected) ? JSON.parse(values[i]) : values[i], Array.isArray(expected) ? expected : expected == null ? '' : String(expected))
  })
  for (const title of ['=SUM(1,2)', ' +cmd', '-formula', '@function', '\tcommand', '\ncommand']) {
    assert.equal(parseCsv(serializeCsv([{...concert,title}]))[1][fields.indexOf('title')], `'${title}`)
  }
  assert.equal(parseCsv(serializeCsv([])).length,1)
  assert.throws(() => assertExportSize('x'.repeat(20*1024*1024+1)),{code:'export_too_large'})
})

test('limiter caps ordinary requests, exports and concurrency, then expires', () => {
  let now = 0
  const limiter = createLimiter(() => now)
  for(let i=0;i<60;i++) limiter.attempt('a',false)
  assert.throws(() => limiter.attempt('a',false),{statusCode:429})
  for(let i=0;i<5;i++) limiter.attempt('b',true)
  assert.throws(() => limiter.attempt('b',true),{statusCode:429})
  limiter.reserve(); limiter.reserve()
  assert.throws(() => limiter.reserve(),{statusCode:429})
  limiter.release(); limiter.reserve(); limiter.release(); limiter.release()
  now=60001; limiter.attempt('a',true)
})

test('HTTP format parity, pagination, CORS, caching and sanitised errors', async t => {
  let calls=0
  const handler = createConcertApiHandler({
    cache:createDataCache({enabled:()=>true}),env:{},log:()=>{},
    load:async input => {
      calls++
      if(input.url.includes('unknown')) throw fail(404,'source_not_found','Unknown source.')
      if(input.url.includes('broken')) throw new Error('private database information')
      return {source:{id:'2',name:'Orchestra',url:input.url},concerts:input.url.includes('empty')?[]:[sample()],pagination:{total:2,total_pages:2,page:input.page,page_size:input.pageSize,all:input.all},generated_at:'2026-09-23T00:00:00.000Z'}
    },
  })
  const server=createServer(toNodeListener(createApp().use(handler)))
  server.listen(0,'127.0.0.1'); await once(server,'listening')
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))})
  const base=`http://127.0.0.1:${server.address().port}/?url=example.com`
  const json=await fetch(base), data=await json.json()
  assert.equal(json.headers.get('access-control-allow-origin'),'*')
  assert.equal(json.headers.get('x-total-count'),'2')
  assert.match(json.headers.get('link'),/page=2/)
  assert.match(data.pagination.next,/format=json/)
  const csv=await fetch(base+'&format=csv')
  const rows=parseCsv(await csv.text())
  assert.equal(calls,1,'JSON and CSV share cached query data')
  assert.match(csv.headers.get('content-disposition'),/concerts.csv/)
  assert.match(csv.headers.get('link'),/format=csv/)
  assert.deepEqual(JSON.parse(rows[1][fields.indexOf('programme_items')]),data.concerts[0].programme_items)
  const again=await (await fetch(base)).json()
  assert.match(again.pagination.next,/format=json/)
  for(const [url,status,code] of [['unknown.example',404,'source_not_found'],['broken.example',500,'internal_error']]) {
    const response=await fetch(base.replace('example.com',url)+'&format=csv')
    assert.equal(response.status,status)
    const body=await response.json();assert.equal(body.error.code,code);assert.doesNotMatch(JSON.stringify(body),/private/)
  }
  assert.equal((await fetch(base+'&all=true&page=1')).status,400)
  const empty=await fetch(base.replace('example.com','empty.example')+'&format=csv')
  assert.equal(parseCsv(await empty.text()).length,1)
  const preflight=await fetch(base,{method:'OPTIONS'});assert.equal(preflight.status,204)
})


test('OpenAPI field names and ordering match the shared concert contract', () => {
  const spec = JSON.parse(readFileSync(new URL('../docs/openapi.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(spec.components.schemas.Concert.properties), fields)
  assert.deepEqual(spec.components.schemas.Concert.required, fields)
  for (const name of ['performers', 'programme_items', 'composers', 'price_items', 'source_event_urls']) {
    assert.equal(spec.components.schemas.Concert.properties[name].type, 'array')
  }
  assert.ok(spec.paths['/api/v1/concerts'].get.responses['200'].content['text/csv'])
})
