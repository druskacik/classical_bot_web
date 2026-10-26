// @ts-check
import { applyFilters } from '../concert-filters.js'

export const OPTION_LIMIT = 20

/** @param {import('./types').LoaderInput} input */
export const baseQuery = ({ db, request }) => applyFilters(db('serving.current_concert as cc')
  .leftJoin('city as canonical_city', 'canonical_city.id', 'cc.city_id'), request.context)

/** @param {import('./types').LoaderInput} input */
export const publicLocations = ({ db, site }) => db('serving.current_concert as cc')
  .modify(builder => { if (site.country) builder.where('cc.country_code_resolved', site.country) })
