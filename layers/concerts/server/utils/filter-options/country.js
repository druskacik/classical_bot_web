// @ts-check
/** @typedef {import('./types').LoaderInput} LoaderInput */
/** @typedef {import('./types').LoaderResult} LoaderResult */
import { dailyCounts, summaryEligible } from '../serving-facets.js'
import { getCountryName } from '../countries.js'
import { baseQuery, publicLocations as queryPublicLocations } from './queries.js'

/** @param {LoaderInput} input @returns {Promise<LoaderResult>} */
export async function loadCountryOptions(input) {
  const { db: knex, request: { context, selected }, site: concertSite } = input
  const base = () => baseQuery(input)
  const publicLocations = () => queryPublicLocations(input)
  /** @type {import('./types').OptionRow[]} */
  let suggestions = []
  /** @type {import('./types').OptionRow[]} */
  let labels = []
  /** @type {import('./types').CountRow[]} */
  const rows = await (summaryEligible(context) ? dailyCounts(knex,'country',context) : base().select('cc.country_code_resolved as value')
    .whereNotNull('cc.country_code_resolved').countDistinct('cc.id as count').groupBy('cc.country_code_resolved'))
  /** @type {{value: string}[]} */
  const catalogue = await knex('city').distinct('country_code as value')
    .modify(builder => { if (concertSite.country) builder.where('country_code', concertSite.country) })
    .union(publicLocations().distinct(knex.raw('COALESCE(cc.country_code_resolved, cc.country_code_raw) as value')))
  const counts = new Map(rows.map(row => [row.value, Number(row.count)]))
  suggestions = catalogue.filter(row => /^[A-Z]{2}$/.test(row.value || ''))
    .map(row => ({ value: row.value, label: getCountryName(row.value), count: counts.get(row.value) || 0 }))
  labels = selected.filter(value => !concertSite.country || value === concertSite.country).map(value => ({ value, label: getCountryName(value) }))
  return { suggestions, selectedOptions: labels }
}
