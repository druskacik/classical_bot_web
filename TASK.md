# Switch public concert reads to the resolved concert dataset

## Goal and context

Move ClassicalBot Web (including its shared concert layer, Slovak app, business API and alerts) to the consolidated PostgreSQL read model implemented in `../classical_bot`. A duplicate group previously exposed only the representative row's metadata, losing performers, works or venues recorded on other members. The database now resolves these fields and relationships centrally. Consumers should use that result without implementing their own aggregation policy.

The user reports the backend changes are deploying now. Deployment and initial population have NOT been verified for this handoff. Do not assume that relation existence means it is ready to query.

This task authorizes implementation in the web project, not commits, pushes or deployment. Read this repository's AGENTS.md. Its `.env` contains production credentials: never print/read it; let the runtime load it. Do not write to production for testing.

Backend references (source of truth):

- `../classical_bot/deployment/resolved-concerts.md`: policy, interfaces and operations.
- `../classical_bot/db/migrations/versions/20261022000100_resolved_concerts.py`
- `../classical_bot/db/migrations/sql/20261022000100_resolved_concerts.sql`: exact columns and SQL definitions.
- `../classical_bot/db/resolved_concerts.py`: publication/readiness logic.
- `../classical_bot/tests/test_resolved_concerts.py`: policy fixtures.

The analyzer service automatically populates the materialized views after migration and refreshes 15 minutes after the last successful publication. There are no new environment settings to enable this. All six views publish in one transaction; existing readers keep the previous data during subsequent refreshes and failures. Local synthetic refreshes took about 2–3 minutes; production duration is unverified. Do not trigger refreshes from web requests.

## Readiness before cutover

Use the existing read-only DB query command (`npm run db:query -- --query ... --format table`) to inspect deployed schema and grants. First check `to_regclass` for the relations; then inspect `resolved_concert_refresh_state` and `pg_matviews.ispopulated` for all six views. Require a successful `published_at` and populated views, and inspect failure/integrity counts. Confirm the web DB role has SELECT access. Never treat an absent or unpopulated dataset as a successful empty catalogue.

Serve the last successful published data during later refresh failures; publication older than 45 minutes is considered stale. Handle initial unavailability explicitly (controlled service-unavailable response, or postpone deployment until ready), rather than silently mixing raw and resolved query paths. Do not expose internal diagnostics/evidence in public errors.

## Database contract

| Relation | Key | Use |
| --- | --- | --- |
| `resolved_concert` | `id` | One row per included representative; scalar values, coherent location/purchase bundles, sources, provenance, conflicts |
| `resolved_concert_member` | `member_id` | `concert_id` maps source rows to representative; `eligible`, `data`, `states`, `venue_data` preserve snapshot evidence |
| `resolved_concert_performer` | `concert_id, performer_id` | Unioned credits; `performer` JSON snapshot, roles/instruments arrays, credit attributes, display_order |
| `resolved_concert_work` | `concert_id, work_id` | `work` JSON snapshot, composer_id, programme_label, programme_labels |
| `resolved_concert_composer` | `concert_id, composer_id` | `composer` JSON snapshot; explicit composers plus composers of resolved works |
| `resolved_concert_ticket_price` | `concert_id, offer_id` | `offer` JSON containing price fields; source-specific offers retained |

Important differences from the old tables:

- Relationship foreign keys are `concert_id`, not `classical_concert_id`. Alias them in adapter queries if that avoids unnecessary serializer changes.
- `resolved_concert` has no `inclusion_status` or `duplicate_of_id`. Eligibility and grouping are already applied. Keep existing upcoming/date, country, city and site restrictions, but remove raw eligibility predicates from resolved queries.
- All dates exist in the views. The web still applies its upcoming-only scope.
- `resolved_concert.id` is the representative's raw ID, not a permanent event identity. Representative switches can change it.
- `resolved_concert_member` also contains INELIGIBLE members for diagnostics. Require `eligible` for public source matching/provenance; never use it as a standalone public concert listing.
- Country-only location values are preserved. Invalidated representative geography does not veto a valid donor; valid representative geography still enforces compatibility. Do not reintroduce raw-location overrides in the frontend.
- Lists union canonical IDs; conflicts do not mean a record should automatically be hidden. Keep internal `conflicts`, `states`, original declarations and evidence out of the existing public contract unless explicitly needed.
- Multi-query reads (count, page, relationships) must share a read-only REPEATABLE READ transaction. Otherwise a refresh can split one response across generations. The business API already does this; preserve it. Pass the transaction to helpers rather than letting them use the global connection internally.
- Filter and paginate on resolved fields/relationships before loading detail arrays. Use EXISTS or distinct concert IDs for many-to-many filters to avoid inflated counts/duplicate pages.

## Explicit field adaptations

Inspect the actual definitions and preserve current response schemas, types, date formatting, ordering, null behavior and export limits.

1. `source` and `source_url` are not scalar columns on `resolved_concert`. Its `sources` JSON array contains `{concert_id, url, source_url, source}` for eligible members. For existing single-source display fields, use the representative entry when available, with a deterministic eligible fallback. Source filtering/coverage must consider all eligible member sources, not just the displayed one.
2. `last_verified_at` is not a top-level resolved column. Preserve the existing business API meaning using the representative's `resolved_concert_member.data->>'last_verified_at'`, cast as appropriate. Do not substitute publication time or claim that every unioned field was verified at that time.
3. Venue attributes are available in `resolved_concert.venue_details` (JSON snapshot). Use this selected venue and the resolved geography bundle. Do not COALESCE unrelated live/raw venue geography over it. Existing city names/aliases/coordinates and parent-venue or ensemble-name enrichment can still use registry tables where needed; distinguish such live enrichment from the published snapshot.
4. Performer/work/composer identity attributes are JSON snapshots (`performer`, `work`, `composer`). Extract/alias needed fields for existing serializers. Do not replace resolved relationships with joins to raw concert link tables.
5. Prices use `offer_id` as the existing output price ID and `offer` JSON for kind, amount, amount_max, currency, price_type, category, audience, conditions and basis. Preserve decimal/null serialization and do not merge offers merely because their displayed prices match.
6. Keep source registry alias resolution (`crawler_source`, `crawler_source_url`) separate from concert duplicate mapping. Source duplicates and concert duplicates are different concepts.

## Implementation inventory

Audit the full repo for raw concert and relationship reads; this is a starting inventory, not a blind table-name replacement:

- `layers/concerts/server/utils/public-concerts.js`: central public scope currently hardcodes inclusion_status/duplicate_of_id. Introduce a clear resolved-data scope and migrate consumers consistently.
- `layers/concerts/server/utils/concert-filters.js`, `concert-works.js`, `city-catalogue.js`: filters, relationship queries and location discovery.
- `layers/concerts/server/api/get-concerts.js`: count/page/relationship snapshot consistency and missing scalar source fields.
- Other shared API endpoints: `get-concert-map.js`, `get-concert-filter-options.js`, `get-composers.js`, `get-countries.js`, `get-sources.js`.
- `server/utils/business-api/query-concerts.js` and `serialize-concert.js`: preserve `/api/v1/concerts` contract. Replace application-side traversal of raw `duplicate_of_id` chains with the materialized member mapping. Match the requested source aliases against eligible member `data.source_url`; select distinct mapped concert IDs. Return the group's complete resolved metadata while keeping `source_event_urls` restricted to matching source members. Preserve source URL normalization and source identity behavior.
- `server/utils/composer-queries.js`, `composer-recommendation-query.js`: rankings/counts must include relationships contributed by duplicates. Retain intentional source-registry recursion.
- `server/utils/sitemap-inventory.js`, `server/middleware/legacy-concert-location.js`: public counts/location existence.
- `apps/classical-sk/server/api/get-cities.js`, `apps/classical-sk/server/plugins/sitemap.js`: verify country/site-specific coverage.
- `server/utils/alerts/criteria.js`: matching and programme content must use resolved data.
- `server/utils/alerts/worker.js`: review delivery-history identity handling separately. Raw duplicate traversal may still be necessary for historical IDs after representative switches. Do not blindly remove it or re-send previously delivered concerts. Preserve existing alert semantics; metadata additions alone must not cause repeat delivery.
- Inspect caches and bump relevant cache namespaces/version keys if necessary so pre-cutover raw responses do not survive deployment. Align any snapshot-related cache keys with successful publication, not an in-progress attempt.

Keep registry/source onboarding and writes, ingestion diagnostics, and alert delivery state on their appropriate existing tables. This is a public concert read cutover, not a schema-wide prohibition on raw tables. No new artist/venue search API or UI redesign is requested.

## Tests and acceptance

Use isolated database fixtures for integration tests; production is read-only. Update SQL/mock fixtures to reflect actual view columns. Include:

- Representative missing performers/works/venue, eligible duplicate supplying them: listings and API expose the consolidated data once.
- Composer/work/performer/source filters and counts find donor-only relationships; pagination has no multiplication from joins.
- Source URL API returns a group when only a nonrepresentative eligible member matches; source_event_urls excludes other sources and ineligible members.
- Country-only location, invalidated representative with a valid donor, and valid representative rejecting incompatible geography.
- Excluded/quarantined groups and broken chains do not leak into public results.
- Singletons, historical-date restrictions, null/decimal/date serialization, exports and stable ordering remain compatible.
- Initial unavailable dataset has an explicit failure path; later failures keep the last published dataset usable.
- Multi-query response remains on one generation across publication (integration test where feasible).
- Alert matching includes donor data without losing delivery-history deduplication on representative changes.
- Country/city/radius/area filters, maps, source discovery, sitemaps and both site variants remain consistent.

Run relevant test suites and `npm run build`; exercise representative pages/API locally and browser-check affected discovery flows using repository guidance. Report any unavailable PostgreSQL/browser checks explicitly, not as passes. Use EXPLAIN ANALYZE for representative read-only listing/filter/source API queries against realistic data: source JSON matching may need care to avoid repeated full-table scans. Do not copy production data locally without authorization.

## Backend boundary and completion

No additional classical_bot schema change is currently known to be necessary. Missing legacy scalar output fields can be adapted from existing snapshot JSON as described above. If measured query plans show that a new index or a genuinely missing field is required, report the concrete need for a NEW backend migration; never edit the already deployed migration from this task.

Complete when public concert consumers use the resolved dataset consistently, existing external contracts remain intact, old duplicate aggregation is removed where replaced by member mapping, readiness is handled, and tests/build pass. Record any intentionally retained raw reads and why. Verify current production readiness read-only before an eventual cutover; this task does not assert that the ongoing backend deployment has completed.
