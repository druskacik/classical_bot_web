// One batch for the complete public directory. A source votes once per pair,
// regardless of how many performances of that programme it advertises.
export const recommendationSql = `
WITH RECURSIVE roots AS (
  SELECT id, id AS root_id FROM crawler_source WHERE duplicate_of_id IS NULL
  UNION ALL
  SELECT c.id, r.root_id FROM crawler_source c JOIN roots r ON c.duplicate_of_id = r.id
), aliases AS (
  SELECT id AS source_id, canonical_url AS url FROM crawler_source
  UNION SELECT crawler_source_id, url FROM crawler_source_url
), source_map AS MATERIALIZED (
  SELECT rtrim(trim(a.url), '/') AS url, min(r.root_id) AS root_id
  FROM aliases a JOIN roots r ON r.id = a.source_id
  WHERE NULLIF(rtrim(trim(a.url), '/'), '') IS NOT NULL
  GROUP BY rtrim(trim(a.url), '/') HAVING count(DISTINCT r.root_id) = 1
), source_lookup AS MATERIALIZED (
  SELECT jsonb_object_agg(url, root_id::text) AS lookup FROM source_map
), eligible AS MATERIALIZED (
  SELECT DISTINCT composer_id FROM composer_spotify_playlist
  WHERE status = 'published' AND is_public = true
    AND spotify_playlist_id ~ '^[A-Za-z0-9]{22}$'
), links AS MATERIALIZED (
  SELECT cc.id AS concert_id, l.composer_id,
    COALESCE('registry:' || (s.lookup ->> rtrim(trim(cc.source_url), '/')),
      'url:' || NULLIF(rtrim(trim(cc.source_url), '/'), '')) AS source_key
  FROM classical_concert cc
  JOIN classical_concert_composer l ON l.classical_concert_id = cc.id
  JOIN eligible e ON e.composer_id = l.composer_id CROSS JOIN source_lookup s
  WHERE cc.date >= CURRENT_DATE AND cc.inclusion_status = 'included'
    AND cc.duplicate_of_id IS NULL
    AND NULLIF(rtrim(trim(cc.source_url), '/'), '') IS NOT NULL
), totals AS MATERIALIZED (
  SELECT composer_id, count(DISTINCT source_key) AS total
  FROM links GROUP BY composer_id
), pairs AS (
  SELECT a.composer_id AS page_id, b.composer_id,
    count(DISTINCT a.source_key) AS shared
  FROM links a JOIN links b ON b.concert_id = a.concert_id AND b.composer_id <> a.composer_id
  GROUP BY a.composer_id, b.composer_id
)
SELECT p.page_id, p.composer_id, p.shared, t.total,
  p.shared::numeric / t.total AS score
FROM pairs p JOIN totals t ON t.composer_id = p.composer_id
JOIN composer c ON c.id = p.composer_id
ORDER BY p.page_id, score DESC, p.shared DESC, c.name, c.id
`

export async function queryComposerRecommendations(db) {
  return db.transaction(async trx => {
    await trx.raw("SET LOCAL statement_timeout = '15s'")
    // This aggregation's estimated cost otherwise triggers expensive JIT
    // compilation. The setting is confined to this read-only transaction.
    await trx.raw('SET LOCAL jit = off')
    const { rows } = await trx.raw(recommendationSql)
    const rankings = {}
    for (const row of rows) {
      (rankings[row.page_id] ||= []).push({
        id: Number(row.composer_id), score: Number(row.score),
        sharedSources: Number(row.shared), totalSources: Number(row.total),
      })
    }
    return rankings
  }, { readOnly: true })
}
