import knex from '../utils/connection.js'
import { getCountryName } from '../utils/countries.js'

export default defineEventHandler(async () => {
  try {
    const rows = await knex('classical_concert')
      .from('classical_concert as cc')
      .leftJoin('crawler_source as direct_source', function joinDirectSource() {
        this.on(
          knex.raw("LOWER(RTRIM(direct_source.canonical_url, '/'))"),
          '=',
          knex.raw("LOWER(RTRIM(cc.source_url, '/'))"),
        )
      })
      .leftJoin('crawler_source_url as source_alias', function joinSourceAlias() {
        this.on(
          knex.raw("LOWER(RTRIM(source_alias.url, '/'))"),
          '=',
          knex.raw("LOWER(RTRIM(cc.source_url, '/'))"),
        )
      })
      .leftJoin('crawler_source as alias_source', 'alias_source.id', 'source_alias.crawler_source_id')
      .distinct(
        knex.raw('COALESCE(direct_source.country_code, alias_source.country_code, cc.country_code_resolved) as country_code'),
        'cc.source',
        'cc.source_url',
      )
      .whereRaw('cc.date >= CURRENT_DATE')
      .whereNotNull('cc.source')
      .whereNotNull('cc.source_url')
      .whereRaw('COALESCE(direct_source.country_code, alias_source.country_code, cc.country_code_resolved) IS NOT NULL')
      .orderBy('cc.source', 'asc')

    const groupedSources = new Map()

    for (const row of rows) {
      if (!groupedSources.has(row.country_code)) {
        groupedSources.set(row.country_code, [])
      }

      groupedSources.get(row.country_code).push({
        name: row.source,
        url: row.source_url,
      })
    }

    return Array.from(groupedSources, ([code, sources]) => ({
      code,
      name: getCountryName(code),
      sources,
    })).sort((left, right) => left.name.localeCompare(right.name, 'en'))
  } catch (error) {
    console.error('Error fetching sources:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch sources',
    })
  }
})
