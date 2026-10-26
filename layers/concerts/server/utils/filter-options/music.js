// @ts-check
/** @typedef {import('./types').LoaderInput} LoaderInput */
/** @typedef {import('./types').LoaderResult} LoaderResult */
import { dailyCounts, summaryEligible } from '../serving-facets.js'
import { composerIdentities } from '../composer-identities.js'
import { normalizedLikePattern } from '../search-text.js'
import { baseQuery, OPTION_LIMIT } from './queries.js'

/** @param {LoaderInput} input @returns {Promise<LoaderResult>} */
export async function loadMusicOptions(input) {
  const { db: knex, request: { type, context, search, selected, includeUnavailable } } = input
  const base = () => baseQuery(input)
  /** @type {import('./types').OptionRow[]} */
  let suggestions = []
  /** @type {import('./types').OptionRow[]} */
  let labels = []
  // Scalar projections inline into the joins. jsonb_to_record hides the
  // grouping cardinality from PostgreSQL, which can estimate one composer
  // and repeatedly rescan the identity catalogue for thousands of groups.
  const composerSnapshots = () => knex('serving.current_concert_composer')
    .select('concert_id', 'composer_id as id', 'name')
  const fields = type === 'composer' ? ['c.name as value', 'c.name as label'] : [knex.raw('w.id::text as value'), 'w.title as label', 'c.name as secondaryLabel']
  const rawGrouped = () => type === 'composer'
    ? base().join(composerSnapshots().as('c'), 'c.concert_id', 'cc.id')
        .select(...fields).countDistinct('cc.id as count').groupBy('c.name')
    // Work suggestions join availability by ID, not title. Keep native
    // keys for planner statistics/indexes; only serialize IDs at the edge.
    // The publication already includes each work's composer, so counting
    // works needs neither JSON labels nor another relationship join.
    : base().join('serving.current_concert_work as ccw', 'ccw.concert_id', 'cc.id')
        .select('ccw.work_id as value').countDistinct('cc.id as count').groupBy('ccw.work_id')
  const grouped = () => summaryEligible(context) ? dailyCounts(knex,type,context) : rawGrouped()
  // Published names/search keys stay aligned with availability and filtering.
  // Only composers absent from the publication use live catalogue identities.
  const identities = () => {
    // SQL aliases define the projection; mutate the builder without losing that type.
    /** @type {import('knex').Knex.QueryBuilder<Record<string, unknown>, import('./types').OptionRow[]>} */
    const query = knex.queryBuilder()
    if (type === 'composer') query.from(composerIdentities(knex).as('c'))
    else query.from('work as w').join(composerIdentities(knex).as('c'), 'c.id', 'w.composer_id')
    query.select(fields)
    return query
  }
  const key = type === 'composer' ? 'c.name' : 'w.id'
  const matching = identities()
    .select(knex.raw('COALESCE(availability.count, 0) as count'))
    .leftJoin(grouped().as('availability'), type === 'composer' ? 'c.name' : 'w.id', 'availability.value')
  if (type === 'work' && context.composers.length) {
    // Composer and work filters match the concert independently: retain
    // other composers' works on matching programmes, while limiting only
    // zero-match catalogue suggestions to the selected composers.
    matching.where(inner => inner.whereIn('c.name', context.composers).orWhere('availability.count', '>', 0))
  }
  if (!includeUnavailable) matching.where('availability.count', '>', 0)
  const searchFields = type === 'composer' ? ['c.normalized_name'] : ['w.normalized_title', 'c.normalized_name']
  if (search) {
    matching.where(inner => {
      for (const field of searchFields) inner.orWhereILike(field, normalizedLikePattern(search))
    })
    /** @param {'=' | 'ILIKE'} operator */
    const rank = operator => searchFields.map(() => `?? ${operator} ?`).join(' OR ')
    matching.orderByRaw(`CASE WHEN ${rank('=')} THEN 0 WHEN ${rank('ILIKE')} THEN 1 ELSE 2 END`, [
      ...searchFields.flatMap(field => [field, search]),
      ...searchFields.flatMap(field => [field, normalizedLikePattern(search).slice(1)]),
    ])
  }
  suggestions = await matching.orderBy('count', 'desc').orderBy('label').orderByRaw('?? ASC', [key]).limit(OPTION_LIMIT)
  if (selected.length) {
    const values = type === 'composer' ? selected : selected.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
    /** @type {[import('./types').OptionRow[], import('./types').CountRow[]]} */
    const [identitiesRows, counts] = await Promise.all([
      identities().whereIn(key, values),
      knex.from(grouped().as('counts')).select('value','count').whereIn('value',values),
    ])
    labels = identitiesRows.map(row => ({ ...row, count: Number(counts.find(item => String(item.value) === String(row.value))?.count || 0) }))
  }
  return { suggestions, selectedOptions: labels }
}
