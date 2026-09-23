import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import knex from 'knex'
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
  const first=await queryConcerts(db,input)
  assert.equal(first.pagination.total,2)
  assert.equal(first.concerts.length,1)
  const c=first.concerts[0]
  assert.equal(c.id,'1')
  assert.deepEqual(c.source_event_urls,['https://alias.example/3','https://example.com/2'])
  assert.equal(c.performers.length,2);assert.equal(c.programme_items.length,2);assert.equal(c.price_items.length,2);assert.equal(c.composers.length,2)
  assert.equal(c.performers[0].ensemble.name,'Orchestra')
  assert.equal(c.parent_venue_name,'Building');assert.equal(c.venue_address,'Street 1')
  assert.equal(c.price_items[0].amount,'10.0000')
  assert.match(c.date,/^\d{4}-\d{2}-\d{2}$/)
  const second=await queryConcerts(db,{...input,page:2})
  assert.equal(second.concerts[0].id,'4');assert.equal(second.concerts[0].event_status,'cancelled')
  assert.deepEqual(second.concerts[0].performers,[])
  const all=await queryConcerts(db,{...input,all:true})
  assert.deepEqual(all.concerts.map(row=>row.id),['1','4'])
  assert.equal((await queryConcerts(db,{...input,url:'https://empty.example/'})).pagination.total,0)
  assert.equal((await queryConcerts(db,{...input,page:3})).concerts.length,0)
  await db.raw(`INSERT INTO classical_concert(id,title,url,source_url,date,inclusion_status) SELECT 100+n,'Export','https://example.com/'||n,'https://example.com/',CURRENT_DATE,'included' FROM generate_series(1,10001) n`)
  await assert.rejects(queryConcerts(db,{...input,all:true}),{code:'export_too_large'})
})
