import { fail, MAX_EXPORT_ROWS } from './contract.js'
import { lookupSource } from './source-lookup.js'
import { serializeConcert } from './serialize-concert.js'
import { withServingSnapshot } from '../../../layers/concerts/server/utils/serving-catalogue.js'

export async function queryConcerts(db,input) {
  const source = await lookupSource(db,input.url)
  return withServingSnapshot(db,trx=>queryConcertSnapshot(trx,input,source))
}

export async function queryConcertSnapshot(trx,input,preparedSource) {
  const resolved=preparedSource || await lookupSource(trx,input.url)
  const scope=()=>trx('serving.current_concert as cc').whereRaw('cc.date>=CURRENT_DATE')
    .whereExists(trx('serving.current_occurrence as o').select(1).whereRaw('o.concert_id=cc.id').whereRaw('o.date>=CURRENT_DATE').whereIn('o.normalized_url',resolved.aliases))
  const count=await scope().count('* as total').first()
  const total=Number(count.total)
  if(input.all && total>MAX_EXPORT_ROWS) throw fail(422,'export_too_large','Export exceeds 10000 concerts; use pagination.')
  const summary=await trx('serving.source_summary').whereRaw('generation_id=serving.pinned_generation()')
    .whereIn('normalized_url',resolved.aliases).orderBy('member_date','desc').orderBy('member_id','desc').first('source')
  const source={id:resolved.id,url:resolved.url,name:summary?.source?.trim() || new URL(resolved.url).hostname}
  const page=await scope().select('cc.id').orderBy('cc.date').orderByRaw('cc.time_from ASC NULLS LAST').orderBy('cc.id')
    .limit(input.all ? MAX_EXPORT_ROWS : input.pageSize).offset(input.all ? 0 : (input.page-1)*input.pageSize)
  const ids=page.map(row=>row.id)
  const docs=ids.length ? await trx('serving.current_document as d').whereIn('d.concert_id',ids)
    .leftJoin('city as city','city.id',trx.raw("(d.scalar->>'city_id')::bigint"))
    .leftJoin('venue as parent','parent.id',trx.raw("(d.scalar->'venue_details'->>'parent_venue_id')::bigint"))
    .select('d.*','city.english_name','city.local_name','parent.name as parent_venue_name') : []
  const occurrences=ids.length ? await trx('serving.current_occurrence').whereIn('concert_id',ids).whereIn('normalized_url',resolved.aliases).select('concert_id','event_url') : []
  const ensembleIds=[...new Set(docs.flatMap(d=>d.performers.map(p=>p.ensemble_id)).filter(Boolean))]
  const ensembles=new Map((ensembleIds.length ? await trx('performer').whereIn('id',ensembleIds).select('id','name') : []).map(p=>[String(p.id),p.name]))
  const byId=new Map(docs.map(d=>[String(d.concert_id),d]))
  const concerts=ids.map(id=>{
    const d=byId.get(String(id)),s=d.scalar,v=s.venue_details || {}
    const row={...s,city:d.english_name || d.local_name || s.city_raw,country_code:s.country_code_resolved || s.country_code_raw,
      venue_name:v.name,venue_address:v.address,venue_url:v.identity_url,latitude:v.latitude,longitude:v.longitude,parent_venue_name:d.parent_venue_name}
    return serializeConcert(row,source,{performers:d.performers.map(p=>({...p,ensemble_name:ensembles.get(String(p.ensemble_id)) || null})),
      works:d.works,composers:d.composers,prices:d.prices,
      sourceUrls:[...new Set(occurrences.filter(o=>String(o.concert_id)===String(id)).map(o=>o.event_url).filter(Boolean))].sort()})
  })
  return {source,concerts,pagination:{page:input.all ? null : input.page,page_size:input.all ? null : input.pageSize,total,total_pages:input.all ? null : Math.ceil(total/input.pageSize),all:input.all},generated_at:new Date().toISOString()}
}
