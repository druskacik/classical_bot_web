import { readFile } from 'node:fs/promises'
import { normalizeUrl } from '../server/utils/business-api/contract.js'

export async function installServingFixture(db) {
  await db.raw('CREATE TABLE IF NOT EXISTS crawler_source(id bigint primary key,canonical_url text,duplicate_of_id bigint)')
  await db.raw('CREATE TABLE IF NOT EXISTS crawler_source_url(crawler_source_id bigint,url text)')
  await db.raw('ALTER TABLE work ADD COLUMN IF NOT EXISTS normalized_title text')
  await db.raw(await readFile(new URL('./serving-schema.sql',import.meta.url),'utf8'))
}
export async function publishServingFixture(db) {
  await db.transaction(async trx=>{
    const state=await trx('resolved_concert_refresh_state').first()
    const [g]=await trx('serving.generation').insert({input_published_at:state.published_at}).returning('id')
    await trx.raw('CREATE TEMP TABLE serving_url_normalization(raw_url text PRIMARY KEY,normalized_url text) ON COMMIT DROP')
    const urls=await trx('resolved_concert_source_url').select('source_url')
    const normalized=urls.map(row=>{let value=null;try{value=normalizeUrl(row.source_url)}catch{};return {raw_url:row.source_url,normalized_url:value}})
    if(normalized.length) await trx('serving_url_normalization').insert(normalized)
    await trx.raw((await readFile(new URL('./serving-project.sql',import.meta.url),'utf8')).replaceAll('%(g)s',String(g.id)))
    await trx('serving.generation').where('id',g.id).update({published_at:trx.fn.now()})
    await trx.raw('UPDATE serving.state SET previous_generation=active_generation,active_generation=?',[g.id])
    const registry=await trx('serving.registry_state').first(),revision=Number(registry.revision)+1
    const sources=await trx('crawler_source').select('*'),aliases=await trx('crawler_source_url').select('*')
    const byId=new Map(sources.map(s=>[String(s.id),s]))
    const root=id=>{const seen=new Set();let row=byId.get(String(id));while(row?.duplicate_of_id && !seen.has(String(row.id))){seen.add(String(row.id));row=byId.get(String(row.duplicate_of_id))};return row && !seen.has(String(row.id)) ? row.id : null}
    if(sources.length) await trx('serving.source_registry').insert(sources.map(s=>({revision,id:s.id,root_id:root(s.id),canonical_url:s.canonical_url})))
    const entries=new Map()
    for(const row of [...sources.map(s=>({id:s.id,url:s.canonical_url})),...aliases.map(a=>({id:a.crawler_source_id,url:a.url}))]) {
      try{const url=normalizeUrl(row.url),rootId=root(row.id);if(rootId)entries.set(`${row.id}:${url}`,{revision,normalized_url:url,hostname:new URL(url).host,source_id:row.id,root_id:rootId})}catch{}
    }
    if(entries.size) await trx('serving.source_url').insert([...entries.values()])
    await trx('serving.registry_state').update({revision,published_at:trx.fn.now()})
  })
}
