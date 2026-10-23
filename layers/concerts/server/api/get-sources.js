import { cachedConcertData } from '../utils/concert-data-cache.js'
import { concertSite } from '#concert-site'
import { getCountryName } from '../utils/countries.js'

const normalizeUrl = url => url.trim().replace(/\/+$/, '').toLowerCase()

const compareSources = (left, right) => (
  left.name.localeCompare(right.name, 'en') || left.url.localeCompare(right.url, 'en')
)

const preferredCandidate = (current, candidate) => {
  if (!current) return candidate

  const countDifference = Number(candidate.concert_count) - Number(current.concert_count)
  if (countDifference !== 0) return countDifference > 0 ? candidate : current

  return compareSources(candidate, current) < 0 ? candidate : current
}

export default defineEventHandler(async () => {
  try {
    return await cachedConcertData('sources', {}, async (knex) => {
      const registryId = 'COALESCE(direct_source.id, alias_source.id)'
      const registryUrl = 'COALESCE(direct_source.canonical_url, alias_source.canonical_url)'
      const countryCode = 'COALESCE(direct_source.country_code, alias_source.country_code)'
      const geographicScope = 'COALESCE(direct_source.geographic_scope, alias_source.geographic_scope)'

      const rows = await knex.from(knex('resolved_concert as concert')
        .join('resolved_concert_member as member', 'member.concert_id', 'concert.id')
        .where('member.eligible', true)
        .select('concert.id', 'concert.date', 'concert.country_code_resolved',
          knex.raw("member.data->>'source' as source"), knex.raw("member.data->>'source_url' as source_url")).as('cc'))
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
        .select(
          knex.raw(`${registryId} as registry_id`),
          knex.raw(`${registryUrl} as registry_url`),
          knex.raw(`${countryCode} as country_code`),
          knex.raw(`${geographicScope} as geographic_scope`),
          'cc.source',
          'cc.source_url',
        )
        .countDistinct('cc.id as concert_count')
        .whereRaw('cc.date >= CURRENT_DATE')
        .modify(query => { if (concertSite.country) query.where('cc.country_code_resolved', concertSite.country) })
        .whereNotNull('cc.source')
        .whereNotNull('cc.source_url')
        .groupBy([
          knex.raw(registryId),
          knex.raw(registryUrl),
          knex.raw(countryCode),
          knex.raw(geographicScope),
          'cc.source',
          'cc.source_url',
        ])

      const candidatesByIdentity = new Map()

      for (const row of rows) {
        const identity = row.registry_id
          ? `registry:${row.registry_id}`
          : `url:${normalizeUrl(row.source_url)}`
        const candidate = {
          ...row,
          name: row.source.trim(),
          url: row.registry_url || row.source_url,
        }

        candidatesByIdentity.set(
          identity,
          preferredCandidate(candidatesByIdentity.get(identity), candidate),
        )
      }

      const internationalSources = []
      const otherSources = []
      const countries = new Map()

      for (const candidate of candidatesByIdentity.values()) {
        const source = { name: candidate.name, url: candidate.url }

        if (candidate.geographic_scope === 'multi_country') {
          internationalSources.push(source)
        } else if (candidate.geographic_scope === 'country' && candidate.country_code) {
          if (!countries.has(candidate.country_code)) countries.set(candidate.country_code, [])
          countries.get(candidate.country_code).push(source)
        } else {
          otherSources.push(source)
        }
      }

      internationalSources.sort(compareSources)
      otherSources.sort(compareSources)

      const countryGroups = Array.from(countries, ([code, sources]) => ({
        code,
        name: getCountryName(code),
        sources: sources.sort(compareSources),
      })).sort((left, right) => left.name.localeCompare(right.name, 'en'))

      return { internationalSources, otherSources, countryGroups }
    })
  } catch (error) {
    if (error.statusCode) throw error
    console.error('Error fetching sources:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch sources',
    })
  }
})
