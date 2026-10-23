import { fail, normalizeUrl } from './contract.js'

// Persistent registry entries are prepared by the backend, independently of concerts.
export async function lookupSource(db,url) {
  return db.transaction(async trx => {
    const installed=await trx.raw("SELECT to_regclass('serving.registry_state') IS NOT NULL AS ready")
    if(!installed.rows[0].ready) throw fail(503,'catalogue_unavailable','Source catalogue temporarily unavailable.')
    const state = await trx('serving.registry_state').first()
    if (!state?.published_at) throw fail(503,'catalogue_unavailable','Source catalogue temporarily unavailable.')
    const entries = () => trx('serving.source_url').where('revision',state.revision)
    let roots = await entries().where('normalized_url',url).distinct('root_id')
    if (!roots.length) roots = await entries().where('hostname',new URL(url).host).distinct('root_id')
    if (!roots.length) throw fail(404,'source_not_found','This organisation is not registered.')
    const sources = await trx('crawler_source as source').whereIn('id',roots.map(r=>r.root_id)).select('id','canonical_url','duplicate_of_id',trx.raw("COALESCE(to_jsonb(source)->>'status','active') AS status"),trx.raw("to_jsonb(source)->>'next_attempt_at' AS next_attempt_at"))
    if (sources.some(s=>s.duplicate_of_id)) throw fail(503,'catalogue_unavailable','Source catalogue is being updated.')
    if (sources.length>1) throw fail(422,'ambiguous_source','Use a registered canonical URL.',{candidates:sources.map(s=>s.canonical_url).sort()})
    if (!sources.length) throw fail(404,'source_not_found','This organisation is not registered.')
    const source = sources[0]
    const aliases = await entries().where('root_id',source.id).distinct('normalized_url')
    return {registryRevision:String(state.revision),id:String(source.id),url:source.canonical_url,aliases:aliases.map(a=>a.normalized_url),
      status:source.status,next_attempt_at:source.next_attempt_at ? new Date(source.next_attempt_at).toISOString() : null}
  },{isolationLevel:'repeatable read',readOnly:true})
}

export async function registerLookup(trx,source,url,normalized) {
  await trx.raw("SELECT pg_advisory_xact_lock(hashtext('serving-source-registry-v1'))")
  const state=await trx('serving.registry_state').first()
  await trx('serving.source_registry').insert({revision:state.revision,id:source.id,root_id:source.id,canonical_url:url}).onConflict(['revision','id']).ignore()
  await trx('serving.source_url').insert({revision:state.revision,normalized_url:normalized,hostname:new URL(normalized).host,source_id:source.id,root_id:source.id}).onConflict(['revision','normalized_url','source_id']).ignore()
}

// Recover only an exact URL after a concurrent raw-registry writer wins a unique
// constraint. Indexed point reads avoid rebuilding the registry on a request.
export async function repairRegistrationLookup(db,normalized,canonical) {
  return db.transaction(async trx => {
    await trx.raw("SET LOCAL statement_timeout='10s'")
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext('serving-source-registry-v1'))")
    const alias = await trx('crawler_source_url').where('normalized_url',normalized).first('crawler_source_id')
    let source = alias ? await trx('crawler_source').where('id',alias.crawler_source_id).first()
      : await trx('crawler_source').where('canonical_url',canonical).first()
    const seen = new Set()
    while(source?.duplicate_of_id) {
      if(seen.has(String(source.id))) return false
      if(seen.size>=64) throw fail(503,'catalogue_unavailable','Source catalogue is being updated.')
      seen.add(String(source.id))
      source = await trx('crawler_source').where('id',source.duplicate_of_id).first()
    }
    if(!source) return false
    let rootUrl=normalized
    try { rootUrl=normalizeUrl(source.canonical_url) } catch {}
    await registerLookup(trx,source,source.canonical_url,rootUrl)
    if(normalized!==rootUrl) await registerLookup(trx,source,source.canonical_url,normalized)
    return true
  })
}
