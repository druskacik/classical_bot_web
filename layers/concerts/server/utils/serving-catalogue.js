import { createError } from 'h3'
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Concert catalogue temporarily unavailable' })

export async function servingPublication(db) {
  const { rows: installed } = await db.raw("SELECT to_regclass('serving.state') IS NOT NULL AS installed")
  if (!installed[0]?.installed) throw unavailable()
  const row = await db('serving.state as s').join('serving.generation as g','g.id','s.active_generation')
    .first('g.id','g.schema_version','g.published_at','g.input_published_at',db.raw('CURRENT_DATE::text as current_date'))
  if (!row?.published_at || row.schema_version !== 1) throw unavailable()
  return { generation: String(row.id), publishedAt: new Date(row.published_at).toISOString(),
    currentDate: row.current_date, stale: Date.now()-new Date(row.input_published_at).valueOf()>7200_000 }
}

export function withServingSnapshot(db,load) {
  return db.transaction(async trx => {
    await trx.raw("SET LOCAL statement_timeout='15s'; SET LOCAL TIME ZONE 'UTC'")
    const publication = await servingPublication(trx)
    await trx.raw("SELECT set_config('serving.generation',?,true)",[publication.generation])
    return load(trx,publication)
  },{isolationLevel:'repeatable read',readOnly:true})
}

const collection = async (db,ids,field) => ids.length
  ? (await db('serving.current_document').whereIn('concert_id',ids).select(field)).flatMap(row=>row[field]) : []
export const concertComposers = (db,ids) => collection(db,ids,'composers')
export const concertWorks = (db,ids) => collection(db,ids,'works')
