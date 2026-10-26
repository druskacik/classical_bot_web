import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { servingPublication, withServingSnapshot } from '../layers/concerts/server/utils/serving-catalogue.js'

function fixture() {
  const db = knex({ client: 'pg' })
  const state = { installed:true, id:'7', schema_version:1, published_at:new Date(), input_published_at:new Date(), current_date:'2026-10-23' }
  db.client.runner = builder => ({ run: async () => {
    const sql=builder.toSQL().sql
    if(sql.includes('to_regclass')) return {rows:[{installed:state.installed}]}
    return state
  } })
  return { db, state }
}
test('missing schema, publication or incompatible schema fail closed',async()=>{
  for(const patch of [{installed:false},{published_at:null},{schema_version:2}]){
    const {db,state}=fixture();Object.assign(state,patch)
    await assert.rejects(servingPublication(db),{statusCode:503})
  }
})
test('staleness follows input publication; readers pin a repeatable-read generation',async()=>{
  const {db,state}=fixture()
  assert.equal((await servingPublication(db)).stale,false)
  state.input_published_at=new Date(Date.now()-3*3600_000)
  db.context.transaction=async(load,options)=>{assert.deepEqual(options,{isolationLevel:'repeatable read',readOnly:true});return load(db)}
  const result=await withServingSnapshot(db,async(trx,p)=>{assert.equal(trx,db);return p})
  assert.equal(result.generation,'7');assert.equal(result.stale,true)
})
