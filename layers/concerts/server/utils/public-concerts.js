// Resolved rows already enforce inclusion and duplicate grouping. Callers use alias cc.
export const applyPublicConcertScope = (builder, country = null, cityId = null, siteCountry = null) => {
  builder.whereRaw('cc.date >= CURRENT_DATE')
  if (siteCountry) builder.where('cc.country_code_resolved', siteCountry)
  if (country) builder.where('cc.country_code_resolved', country)
  if (cityId) builder.where('cc.city_id', cityId)
  return builder
}
