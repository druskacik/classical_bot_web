// Exact summaries are used only when every active filter is represented.
export const summaryEligible = context => !context.city && !context.area && !context.bounds
  && !context.composers.length && !context.works.length

export function dailyCounts(db,kind,context) {
  const country=context.siteCountry || context.country
  return db('serving.current_facet_daily').where('kind',kind)
    .where('scope',country ? 'country' : 'global').where('country',country || '')
    .whereRaw('date>=CURRENT_DATE')
    .modify(q=>{
      if(context.dateFrom) q.where('date','>=',context.dateFrom)
      if(context.dateTo) q.where('date','<=',context.dateTo)
    }).select(kind==='work' || kind==='city' ? db.raw(`value::${kind==='city' ? 'bigint' : 'integer'} as value`) : 'value')
    .sum('count as count').groupBy('value')
}
export function rawCitySummary(db,context) {
  const from=context.dateFrom || '0001-01-01',to=context.dateTo || '9999-12-31'
  const country=context.siteCountry || context.country
  return db('serving.current_raw_city_daily')
    .modify(q=>{
      if(context.siteCountry) q.where('resolved_country',context.siteCountry)
      if(context.country) q.where('country',context.country)
    }).select('name',db.raw('MIN(label) AS label'),'country as country_code')
    .select(db.raw("COALESCE(SUM(count) FILTER (WHERE date>=CURRENT_DATE AND date>=?::date AND date<=?::date AND (?::text IS NULL OR resolved_country=?)),0) as count",[from,to,country,country]))
    .groupBy('name','country')
}
