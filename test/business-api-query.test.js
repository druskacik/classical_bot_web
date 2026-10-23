import { installResolvedFixture, publishResolvedFixture } from '../test-support/resolved-fixture.js'
import { resolvedPublication, withResolvedSnapshot, concertWorks, concertPerformers } from '../layers/concerts/server/utils/resolved-concerts.js'
import { matching, concertDetails } from '../server/utils/alerts/criteria.js'
import { parseConcertFilters } from '../layers/concerts/server/utils/concert-filters.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import knex from 'knex'
import { createSourceOnboarding, registerSource } from '../server/utils/business-api/onboarding.js'
import { queryConcerts } from '../server/utils/business-api/query-concerts.js'

// An isolated PostgreSQL cluster, never the application database or .env.
test('PostgreSQL query preserves source connections, primary visibility, dates and relation cardinality', async t => {
  try { execFileSync('initdb',['--version'],{stdio:'ignore'}) } catch { t.skip('PostgreSQL initdb is required for this integration test');return }
  const dir=mkdtempSync(join(tmpdir(),'concert-api-pg-'))
  let running=false,db
  t.after(async()=>{
    await db?.destroy()
    if(running)execFileSync('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop'],{stdio:'ignore'})
    rmSync(dir,{recursive:true,force:true})
  })
  execFileSync('initdb',['-D',join(dir,'data'),'-A','trust','--no-locale','-E','UTF8'],{stdio:'ignore'})
  execFileSync('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-h '' -k ${dir} -p 55439 -F`,'-w','start'],{stdio:'ignore'})
  running=true
  db=knex({client:'pg',connection:{host:dir,port:55439,database:'postgres'},pool:{min:0,max:2}})
  await db.raw(`
    SET TIME ZONE 'UTC';
    CREATE TABLE crawler_source(id bigint primary key,canonical_url text,duplicate_of_id bigint);
    CREATE TABLE crawler_source_url(crawler_source_id bigint,url text);
    CREATE TABLE city(id bigint primary key,english_name text,local_name text);
    CREATE TABLE venue(id bigint primary key,name text,address text,identity_url text,parent_venue_id bigint,city_id bigint,country_code text,latitude float8,longitude float8);
    CREATE TABLE classical_concert(id integer primary key,title text,url text,source text,source_url text,date date,time_from time,time_to time,venue text,venue_id bigint,city_id bigint,city_raw text,country_code_resolved text,country_code_raw text,buy_url text,event_status text,last_verified_at timestamptz,admission_type text,booking_kind text,booking_status text,on_sale_at timestamptz,inclusion_status text,duplicate_of_id integer);
    CREATE TABLE performer(id bigint primary key,name text,kind text,identity_url text);
    CREATE TABLE classical_concert_performer(classical_concert_id int,performer_id bigint,roles text[],instruments text[],voice_type text,character_name text,ensemble_id bigint,qualifier text,display_order int);
    CREATE TABLE composer(id integer primary key,name text);
    CREATE TABLE work(id integer primary key,title text,catalogue_number text,composer_id int);
    CREATE TABLE classical_concert_work(classical_concert_id int,work_id int,programme_label text);
    CREATE TABLE classical_concert_composer(classical_concert_id int,composer_id int);
    CREATE TABLE classical_concert_ticket_price(id int,classical_concert_id int,kind text,price_type text,amount numeric(14,4),amount_max numeric(14,4),currency text,category text,audience text,conditions text,basis text);
    INSERT INTO crawler_source VALUES(1,'https://example.com/',NULL),(2,'https://other.example/',NULL),(3,'https://old.example/',1),(4,'https://empty.example/',NULL);
    INSERT INTO crawler_source_url VALUES(3,'https://alias.example/');
    INSERT INTO city VALUES(1,'Prague','Praha');
    INSERT INTO venue VALUES(1,'Hall','Street 1',NULL,2,1,'CZ',50,14),(2,'Building',NULL,NULL,NULL,1,'CZ',NULL,NULL);
    INSERT INTO classical_concert(id,title,url,source,source_url,date,time_from,venue_id,city_id,inclusion_status,duplicate_of_id,event_status)
    VALUES
    (1,'Primary','https://other.example/1','Other','https://other.example/',CURRENT_DATE,'19:00',1,1,'included',NULL,'scheduled'),
    (2,'Duplicate','https://example.com/2','Orchestra','http://www.example.com',CURRENT_DATE,'19:00',NULL,1,'included',1,'scheduled'),
    (3,'Alias chain','https://alias.example/3','Orchestra','https://alias.example/',CURRENT_DATE,'19:00',NULL,1,'included',2,'scheduled'),
    (4,'Tomorrow','https://example.com/4','Orchestra','https://example.com/',CURRENT_DATE+1,NULL,NULL,1,'included',NULL,'cancelled'),
    (5,'Past','https://example.com/5','Orchestra','https://example.com/',CURRENT_DATE-1,'19:00',NULL,1,'included',NULL,'scheduled'),
    (6,'Excluded','https://example.com/6','Orchestra','https://example.com/',CURRENT_DATE,'19:00',NULL,1,'excluded',NULL,'scheduled'),
    (7,'Duplicate of excluded','https://example.com/7','Orchestra','https://example.com/',CURRENT_DATE,'19:00',NULL,1,'included',6,'scheduled'),
    (8,'Cycle','https://example.com/8','Orchestra','https://example.com/',CURRENT_DATE,'19:00',NULL,1,'included',9,'scheduled'),
    (9,'Cycle','https://example.com/9','Orchestra','https://example.com/',CURRENT_DATE,'19:00',NULL,1,'included',8,'scheduled');
    INSERT INTO performer VALUES(1,'Violinist','person',NULL),(2,'Orchestra','ensemble',NULL);
    INSERT INTO classical_concert_performer VALUES(1,1,ARRAY['soloist'],ARRAY['violin'],NULL,NULL,2,NULL,1),(1,2,ARRAY['ensemble'],ARRAY[]::text[],NULL,NULL,NULL,NULL,2);
    INSERT INTO composer VALUES(1,'Composer'),(2,'Composer without work');
    INSERT INTO work VALUES(1,'Symphony','Op. 1',1),(2,'Concerto','Op. 2',1);
    INSERT INTO classical_concert_work VALUES(1,1,'Symphony excerpt'),(1,2,'Concerto');
    INSERT INTO classical_concert_composer VALUES(1,1),(1,2);
    INSERT INTO classical_concert_ticket_price VALUES(1,1,'from','admission',10,NULL,'EUR',NULL,NULL,NULL,NULL),(2,1,'exact','fee',2,NULL,'EUR',NULL,NULL,NULL,NULL);
  `)
  const input={url:'https://example.com/',page:1,pageSize:1,all:false}
  await assert.rejects(queryConcerts(db,input), { statusCode: 503 })
  // All relationships and the selected venue are supplied only by a duplicate.
  await db.raw(`UPDATE classical_concert SET country_code_resolved='CZ';
    UPDATE classical_concert SET venue_id=NULL,last_verified_at='2026-01-02T03:04:05Z' WHERE id=1;
    UPDATE classical_concert SET venue_id=1 WHERE id=2;
    UPDATE classical_concert_performer SET classical_concert_id=2;
    UPDATE classical_concert_work SET classical_concert_id=2;
    UPDATE classical_concert_composer SET classical_concert_id=2;
    UPDATE classical_concert_ticket_price SET classical_concert_id=2;`)
  await installResolvedFixture(db, { populate: false })
  await assert.rejects(queryConcerts(db,input), { statusCode: 503 })
  await db('concert_extraction_state').insert({ classical_concert_id:2,field_group:'venue',status:'succeeded',accepted_at:new Date(),accepted_model:'fixture',accepted_result:JSON.stringify({status:'complete',place:{existing_id:1},source_url:'https://hall.test',evidence:'Hall address'}) })
  await db('classical_concert').insert({id:12,title:'Historical concert',url:'https://empty.example/past',
    source:'Historical source name',source_url:'http://www.empty.example',date:db.raw('CURRENT_DATE-30'),inclusion_status:'included'})
  await publishResolvedFixture(db)
  // Ineligible provenance is retained internally, never returned for source matching.
  await db('classical_concert').insert({id:10,title:'Ineligible member',url:'https://example.com/private',source_url:'https://example.com/',date:new Date(),inclusion_status:'quarantined',duplicate_of_id:1})
  await publishResolvedFixture(db, { concurrent: true })
  const queries = []
  const recordQuery = query => queries.push(query.sql)
  db.on('query', recordQuery)
  const first=await queryConcerts(db,input)
  db.off('query', recordQuery)
  assert.ok(queries.some(sql => sql.includes('from "resolved_concert_source_url"')))
  assert.ok(!queries.some(sql => /select distinct.*source_url.*resolved_concert_member/is.test(sql)), 'no global JSON URL discovery')
  assert.ok(queries.some(sql => sql.includes('from "resolved_concert_member"') && sql.includes(' in (')), 'member lookup stays selective')
  assert.equal(first.pagination.total,2)
  assert.equal(first.concerts.length,1)
  const c=first.concerts[0]
  assert.equal(c.id,'1')
  assert.deepEqual(c.source_event_urls,['https://alias.example/3','https://example.com/2'])
  assert.equal(c.performers.length,2);assert.equal(c.programme_items.length,2);assert.equal(c.price_items.length,2);assert.equal(c.composers.length,2)
  assert.equal(c.last_verified_at,'2026-01-02T03:04:05.000Z')
  assert.equal(c.performers[0].ensemble.name,'Orchestra')
  assert.equal(c.parent_venue_name,'Building');assert.equal(c.venue_address,'Street 1')
  assert.equal(c.price_items[0].amount,'10.0000')
  assert.match(c.date,/^\d{4}-\d{2}-\d{2}$/)
  await db('classical_concert_ticket_price').insert({ id:3,classical_concert_id:3,kind:'from',price_type:'admission',amount:'10.0000',currency:'EUR',source_url:'https://another-vendor.test/' })
  await publishResolvedFixture(db)
  const offers=(await queryConcerts(db,input)).concerts[0].price_items
  assert.equal(offers.length,3, 'equal displayed prices from different offers are not merged by the adapter')
  assert.equal(offers.find(p=>p.id==='3').amount,'10.0000')
  assert.equal(offers.find(p=>p.id==='3').amount_max,null)
  await withResolvedSnapshot(db, async trx => {
    const filters=parseConcertFilters({composers:'Composer without work',works:'1,2',country:'CZ'})
    const count=await matching(trx,filters).count('* as total').first()
    assert.equal(Number(count.total),1, 'donor music filters do not multiply pages')
    assert.equal((await concertPerformers(trx,[1])).length,2)
    assert.match((await concertDetails(trx,filters,[1]))[0].programme,/Composer: Concerto/)
    assert.equal((await trx('resolved_concert as cc').whereExists(trx('resolved_concert_performer as p').select(1).whereRaw('p.concert_id=cc.id').where('p.performer_id',1))).length,1)
    await db('classical_concert').where('id',1).update({title:'Next generation'})
    await db('work').where('id',1).update({title:'New programme'})
    await db('classical_concert').where('id',5).update({source_url:'not a valid URL'})
    await publishResolvedFixture(db, { concurrent:true })
    assert.equal((await trx('resolved_concert').where('id',1).first()).title,'Primary')
    assert.equal((await trx('resolved_concert_source_url').where('source_url','not a valid URL')).length,0, 'directory stays on the same publication')
    assert.equal((await concertWorks(trx,[1])).find(w=>w.id===1).title,'Symphony')
  })
  assert.equal((await queryConcerts(db,input)).concerts[0].title,'Next generation')
  await db('resolved_concert_refresh_state').update({published_at:db.raw("now()-interval '1 hour'"),last_failure_at:db.fn.now(),last_error:'fixture failure'})
  assert.equal((await resolvedPublication(db)).stale,true)
  assert.equal((await queryConcerts(db,input)).pagination.total,2, 'later failures retain the publication')
  assert.equal((await db('resolved_concert_source_url').where('source_url','not a valid URL')).length,1)
  const second=await queryConcerts(db,{...input,page:2})
  assert.equal(second.concerts[0].id,'4');assert.equal(second.concerts[0].event_status,'cancelled')
  assert.deepEqual(second.concerts[0].performers,[])
  const all=await queryConcerts(db,{...input,all:true})
  assert.deepEqual(all.concerts.map(row=>row.id),['1','4'])
  const historical = await queryConcerts(db,{...input,url:'https://empty.example/'})
  assert.equal(historical.pagination.total,0)
  assert.equal(historical.source.name,'Historical source name', 'directory retains historical spellings for source naming')
  assert.equal((await queryConcerts(db,{...input,page:3})).concerts.length,0)
  await t.test('published location bundles preserve country-only locations and donor compatibility', async () => {
    await db('city').insert({ id: 2, english_name: 'Berlin', local_name: 'Berlin' })
    await db('classical_concert').insert([
      {id:30,title:'Location root',url:'https://other.example/30',source_url:'https://other.example/',date:new Date(),city_id:2,country_code_resolved:'DE',inclusion_status:'included'},
      {id:31,title:'Location donor',url:'https://other.example/31',source_url:'https://other.example/',date:new Date(),city_id:1,country_code_resolved:'CZ',venue_id:1,inclusion_status:'included',duplicate_of_id:30},
      {id:32,title:'Country only',url:'https://other.example/32',source_url:'https://other.example/',date:new Date(),country_code_raw:'US',inclusion_status:'included'},
      {id:33,title:'Broken chain',url:'https://other.example/33',source_url:'https://other.example/',date:new Date(),inclusion_status:'included',duplicate_of_id:999999},
    ])
    await db('concert_extraction_state').insert([
      {classical_concert_id:30,field_group:'location',status:'succeeded',requires_revalidation:true},
      {classical_concert_id:31,field_group:'venue',status:'succeeded',accepted_at:new Date(),accepted_model:'fixture',accepted_result:JSON.stringify({status:'complete',place:{existing_id:1},source_url:'https://hall.test',evidence:'Hall address'})},
    ])
    await publishResolvedFixture(db)
    const load=async()=> (await queryConcerts(db,{...input,url:'https://other.example/',all:true})).concerts
    let concerts=await load()
    assert.equal(concerts.find(c=>c.id==='30').venue_id,'1')
    assert.equal(concerts.find(c=>c.id==='30').country_code,'CZ')
    assert.equal(concerts.find(c=>c.id==='32').country_code,'US')
    assert.equal(concerts.find(c=>c.id==='32').city,null)
    assert.equal(concerts.find(c=>c.id==='32').venue_id,null)
    assert.ok(!concerts.some(c=>c.id==='33'))
    await db('concert_extraction_state').where({classical_concert_id:30,field_group:'location'}).update({requires_revalidation:false})
    await publishResolvedFixture(db)
    concerts=await load()
    assert.equal(concerts.find(c=>c.id==='30').country_code,'DE')
    assert.equal(concerts.find(c=>c.id==='30').venue_id,null)
  })
  await db.raw(`INSERT INTO classical_concert(id,title,url,source_url,date,inclusion_status) SELECT 100+n,'Export','https://example.com/'||n,'https://example.com/',CURRENT_DATE,'included' FROM generate_series(1,10001) n`)
  await publishResolvedFixture(db)
  await assert.rejects(queryConcerts(db,{...input,all:true}),{code:'export_too_large'})
  await db.raw(`
    CREATE SEQUENCE api_source_id START 100;
    ALTER TABLE crawler_source ALTER COLUMN id SET DEFAULT nextval('api_source_id');
    ALTER TABLE crawler_source ADD COLUMN status text DEFAULT 'active', ADD COLUMN next_attempt_at timestamptz,
      ADD COLUMN priority int DEFAULT 0, ADD COLUMN geographic_scope text DEFAULT 'unknown', ADD COLUMN created_at timestamptz DEFAULT now();
    ALTER TABLE crawler_source_url ADD COLUMN normalized_url text UNIQUE, ADD COLUMN role text,
      ADD COLUMN discovered_by text, ADD COLUMN metadata_json jsonb;
  `)
  let validations=0
  const onboard=createSourceOnboarding(db,{env:{BUSINESS_API_REGISTRATION_ENABLED:'true',BUSINESS_API_SUBMISSIONS_PER_DAY:'2'},validate:async()=>{validations++}})
  const request={url:'https://new.org/',submittedUrl:'http://www.new.org/'}
  const registered=await Promise.all([onboard(request,'a'),onboard(request,'b')])
  assert.equal(registered[0].id,registered[1].id)
  assert.equal(registered[0].status,'pending')
  const saved=await db('crawler_source').where('id',registered[0].id).first()
  assert.equal(saved.priority,100);assert.equal(saved.canonical_url,'http://www.new.org/')
  assert.equal((await db('crawler_source_url').where('discovered_by','business_api')).length,1)
  await db('crawler_source').where('id',saved.id).update({status:'disabled',priority:12})
  const before=validations
  assert.equal((await onboard(request,'a')).status,'disabled')
  assert.equal(validations,before)
  assert.equal((await db('crawler_source').where('id',saved.id).first()).priority,12)
  assert.equal((await onboard({url:'https://alias.example/'},'a')).id,'1')
  const disabled=createSourceOnboarding(db,{env:{},validate:async()=>assert.fail('disabled registration validated')})
  await assert.rejects(disabled({url:'https://disabled.org/'},'a'),{statusCode:404})
  const existing={url:'https://example.com/'}
  const promote=createSourceOnboarding(db,{
    env:{BUSINESS_API_REGISTRATION_ENABLED:'true',BUSINESS_API_SUBMISSIONS_PER_DAY:'1'},
    validate:async()=>assert.fail('existing source validated'),
    limiter:()=>assert.fail('existing source consumed submission quota'),
  })
  const nextAttempt=new Date('2030-01-01T00:00:00Z')
  for (const status of ['pending','processing','pr_open','retry_wait','active','blocked','disabled','needs_attention']) {
    for (const priority of [12,100,150]) {
      await db('crawler_source').where('id',1).update({status,priority,next_attempt_at:nextAttempt})
      const original=await db('crawler_source').where('id',1).first()
      await disabled(existing,'a')
      assert.deepEqual(await db('crawler_source').where('id',1).first(),original)
      await Promise.all([promote(existing,'a'),promote(existing,'b')])
      const eligible=['pending','processing','pr_open','retry_wait','active'].includes(status)
      const expected={...original,priority:eligible?Math.max(priority,100):priority}
      assert.deepEqual(await db('crawler_source').where('id',1).first(),expected)
      const {rows:[version]}=await db.raw('SELECT xmin::text AS version FROM crawler_source WHERE id = 1')
      await promote(existing,'a')
      assert.deepEqual((await db.raw('SELECT xmin::text AS version FROM crawler_source WHERE id = 1')).rows[0],version)
    }
  }
  for (const url of ['https://alias.example/','https://old.example/']) {
    await db('crawler_source').where('id',1).update({status:'pending',priority:0})
    const duplicate=await db('crawler_source').where('id',3).first()
    assert.equal((await promote({url},'a')).id,'1')
    assert.equal((await db('crawler_source').where('id',1).first()).priority,100)
    assert.deepEqual(await db('crawler_source').where('id',3).first(),duplicate)
  }
  // Registration rechecks an existing source even when the daily allowance is exhausted.
  await db('crawler_source').where('id',1).update({priority:0})
  await registerSource(db,existing,1)
  assert.equal((await db('crawler_source').where('id',1).first()).priority,100)
  // Force the unique-conflict recovery branch, retaining real PostgreSQL lookup/update.
  await db('crawler_source').where('id',1).update({priority:0})
  const conflictDb=new Proxy(db,{get(target,key){
    if(key==='transaction')return async()=>{throw Object.assign(new Error('concurrent registration'),{code:'23505'})}
    return Reflect.get(target,key)
  }})
  await registerSource(conflictDb,existing,1)
  assert.equal((await db('crawler_source').where('id',1).first()).priority,100)
  // A failed promotion must not silently return a successful lookup.
  await db.raw(`CREATE FUNCTION reject_priority_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'promotion failed'; END $$;
    CREATE TRIGGER reject_priority_update BEFORE UPDATE OF priority ON crawler_source
    FOR EACH ROW EXECUTE FUNCTION reject_priority_update();`)
  await assert.rejects(promote({url:'https://other.example/'},'a'),/promotion failed/)
  await db.raw('DROP TRIGGER reject_priority_update ON crawler_source; DROP FUNCTION reject_priority_update()')
  const rejects=createSourceOnboarding(db,{env:{BUSINESS_API_REGISTRATION_ENABLED:'true'},validate:async()=>{throw Object.assign(new Error(),{statusCode:422})}})
  await assert.rejects(rejects({url:'https://invalid.org/'},'a'),{statusCode:422})
  assert.equal((await db('crawler_source').where('canonical_url','https://invalid.org/')).length,0)
  await registerSource(db,{url:'https://second.org/'},2)
  await assert.rejects(registerSource(db,{url:'https://third.org/'},2),{code:'submission_limit'})
  // Historical registrations do not consume today's persistent allowance.
  await db('crawler_source').where('id',saved.id).update({created_at:db.raw("now() - interval '2 days'")})
  await registerSource(db,{url:'https://third.org/'},2)

})
