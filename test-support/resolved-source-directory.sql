-- Exact stored spellings; normalization and registry identity remain consumer policy.
CREATE MATERIALIZED VIEW resolved_concert_source_url AS
SELECT DISTINCT data->>'source_url' AS source_url
FROM resolved_concert_member
WHERE eligible AND data->>'source_url' IS NOT NULL
WITH NO DATA;

CREATE UNIQUE INDEX resolved_source_url_pk ON resolved_concert_source_url (source_url);
