import { fail, normalizeUrl } from './contract.js'
const safeUrl = value => { try { return normalizeUrl(value) } catch { return null } }
// Root trailing slashes are normalized by URL; preserve meaningful path/query identity.
export function resolveSource(input, sources, aliases) {
  const byId = new Map(sources.map(row => [String(row.id), row]))
  const primary = row => {
    const seen = new Set()
    while (row?.duplicate_of_id) {
      if (seen.has(String(row.id))) return null
      seen.add(String(row.id))
      row = byId.get(String(row.duplicate_of_id))
    }
    return row
  }
  const entries = [
    ...sources.map(row => ({ id: row.id, url: row.canonical_url })),
    ...aliases.map(row => ({ id: row.crawler_source_id, url: row.url })),
  ].map(row => ({ ...row, normalized: safeUrl(row.url), source: primary(byId.get(String(row.id))) }))
    .filter(row => row.normalized && row.source)
  let matches = entries.filter(row => row.normalized === input)
  if (!matches.length) matches = entries.filter(row => new URL(row.normalized).host === new URL(input).host)
  const candidates = [...new Map(matches.map(row => [String(row.source.id), row.source])).values()]
  if (!candidates.length) throw fail(404, 'source_not_found', 'This organisation is not registered.')
  if (candidates.length > 1) throw fail(422, 'ambiguous_source', 'Use a registered canonical URL.', { candidates: candidates.map(row => row.canonical_url).sort() })
  const source = candidates[0]
  return {
    id: String(source.id), url: source.canonical_url,
    aliases: [...new Set(entries.filter(row => String(row.source.id) === String(source.id)).map(row => row.normalized))],
  }
}
export const normalizedSourceUrl = safeUrl
