# Resolved concert read cutover

## Deployment gate — recheck before deployment

Implementation does **not** authorize deployment. Production was inspected with
`npm run db:query` (read-only) on 2026-10-22. The first inspection found no resolved
relations. A subsequent inspection found all seven relations and SELECT access,
but **all six materialized views were unpopulated**, `published_at` was null,
and the final recheck showed another attempt failed with `QueryCanceled` at
`2026-10-22T21:51:26Z`, ten minutes after it started (an earlier attempt also
timed out at `21:40:25Z`). Row, integrity and conflict counts were null, not
verified zeros. No production refresh, write, or data transfer was performed.

A later autocomplete investigation successfully read and profiled populated resolved
views. The initial publication blocker is therefore historical, but that narrow
performance check does not replace the full pre-deployment checks below. This web
change neither triggers refreshes nor modifies the deployed migration.

Repeat these read-only checks immediately before deployment, in order:

```sh
npm run db:query -- --format table --query "SELECT name, to_regclass(name) AS relation FROM unnest(ARRAY['resolved_concert_refresh_state','resolved_concert','resolved_concert_member','resolved_concert_source_url','resolved_concert_performer','resolved_concert_work','resolved_concert_composer','resolved_concert_ticket_price']) names(name)"

# Only after every relation exists:
npm run db:query -- --format table --query "SELECT policy_version, snapshot_at, published_at, duration_seconds, row_counts, integrity_count, conflict_count, last_attempt_at, last_failure_at, last_error, published_at < now() - interval '45 minutes' AS stale FROM resolved_concert_refresh_state"

npm run db:query -- --format table --query "SELECT names.name, m.ispopulated, has_table_privilege(current_user,to_regclass(names.name),'SELECT') AS can_select FROM unnest(ARRAY['resolved_concert','resolved_concert_member','resolved_concert_source_url','resolved_concert_performer','resolved_concert_work','resolved_concert_composer','resolved_concert_ticket_price','resolved_concert_refresh_state']) names(name) LEFT JOIN pg_matviews m ON m.schemaname='public' AND m.matviewname=names.name"
```

Require a successful publication, all seven populated views, SELECT access, and
reviewed row/integrity/conflict counts. A later failed refresh is **not** grounds
to discard an existing publication. Publications older than 45 minutes are stale;
`resolvedPublication()` reports this separately from readiness. Backend refresh
monitoring remains responsible for operational failure/staleness diagnostics.

## Consumer behavior

- Shared discovery (list, map, facets, countries, composers, sources), both sites,
  composer rankings, sitemaps, legacy location redirects, business exports and
  alert matching read resolved concerts/relationships.
- `withResolvedSnapshot()` checks readiness and runs multi-query reads in a
  read-only REPEATABLE READ transaction. Helpers receive that transaction.
  Shared data caches check readiness even on hits and use successful
  `published_at`, never attempt/failure times, in their keys.
- Initial data unavailability produces a safe 503, not an empty catalogue or a raw
  fallback. HTTP starts independently of optional composer recommendations; their
  warm-up runs in the background and cannot terminate the server on failure.
  Maintenance startup continues to work without PostgreSQL or recommendation warm-up.
- Resolved publication keys isolate list/business caches and the in-process
  recommendation snapshot. Recommendation background work owns a separate
  read-only transaction, never a request transaction that may already be closed.
  Registry-only city caches remain independent. Sitemap inventory
  and the configured default sitemap storage are process-local; no persistent
  raw sitemap cache is configured in this repository.
- `resolved-concerts.js` adapts JSON snapshots to the existing response fields.
  Lists select the representative source entry with a deterministic member-ID
  fallback; source coverage uses all eligible members. The business API uses
  eligible member mappings, keeps only matching members' event URLs, and reads
  verification time from the representative member. Venue geography is never
  overwritten by a live venue. Prices retain offer IDs, decimal text and null
  optional values. Internal evidence/conflicts are not serialized.
- Source URL spelling normalization remains separate from crawler-source alias
  resolution. To avoid repeating JSON member scans for name, count, page and
  provenance, the business query loads one narrow matching member mapping and
  constrains count/page using distinct representative IDs.

### Intentionally retained raw/registry reads

`server/utils/alerts/worker.js` retains a recursive **historical-ID** walk over
`classical_concert.duplicate_of_id`, augmented by the published member mapping.
It is not a public metadata/listing path. Seen/delivered IDs can predate a
representative switch; removing the walk can resend already delivered events.
Ineligible members may map historical delivery identity, but never public source
provenance. Alert state writes remain on alert tables. Read-only matching and
rendering snapshots run separately from the subscriber-lock/write transaction.

Crawler source registry aliases, onboarding and writes remain on their own tables;
source-registry recursion in recommendations is intentional. City names, aliases,
coordinates, parent-venue names and ensemble names remain live registry enrichment.
`composer-identities.js` supplies a shared published-first identity set for composer
facets, directory/profile navigation, sitemap URLs and ambiguity checks, and subject
resolution (including composer labels on work subjects). Published names and normalized
search keys remain authoritative even in zero-match contexts. Live composer registry
entries supplement only IDs absent from the publication; a renamed registry row is not
an additional alias. Work catalogue entries and Spotify metadata still use their
registries; concert availability and rendered concert programme/credits use resolved
relationships and snapshots. The discovery integration suite follows directory and
sitemap links after a registry rename without republication, checks subject resolution,
stale data after a failed refresh, live-only name collisions and catalogue-only fallback,
and verifies the name change after successful publication on both site scopes.

## Validation

- `npm test`: 208 passed, 3 opt-in suites skipped at the recorded run.
- Full suite with isolated city/alert PostgreSQL fixtures and both startup flags:
  **243 passed, 0 failed, 0 skipped**. No application credentials were loaded by
  these fixtures. They cover both discovery sites, donor-only programme data,
  source matching, location resolution, excluded/broken groups, exports, decimal
  serialization, and publication changes within a REPEATABLE READ response.
- The production startup/maintenance checks were subsequently updated to enforce
  non-fatal recommendation loading (see below), replacing the original fatal-startup
  expectations.
- `npm run build`, `npm run build:sk`, `npm run typecheck`, and
  `npm run typecheck:sk` passed.
- Built servers were exercised over localhost against fictional isolated data:
  `/`, `/map`, lists, music facets, maps, source/country discovery and sitemaps on
  both sites; composer profiles and source JSON/CSV on the global site. Warm-cache
  requests still returned controlled 503s when publication was removed, and kept
  serving published data when only the failure/staleness fields changed.
- Playwright MCP was not available in this session. HTTP/SSR checks are **not** a
  browser-interaction pass; browser-check discovery flows before deployment.

`test-support/resolved-policy-v1.sql` is a verbatim frozen backend policy fixture,
not an application aggregation policy. PostgreSQL integration fixtures install it
only in disposable databases and explicitly publish after synthetic writes.

### Non-blocking recommendation startup

A deployment exposed an availability bug: recommendation SQL timeouts caused the
process to exit before opening HTTP. Optional rankings are no longer a startup or
composer-profile dependency:

- Start the listener first, then attempt background warm-up outside maintenance.
- Keep at most one in-flight aggregation per process. Failures are caught and
  logged without SQL/connection details. Later composer requests can retry only
  after a 60-second failure backoff; there is no continuous retry timer.
- Keep one successful publication's rankings in memory with a 24-hour refresh age.
  Same-publication rankings remain usable during refresh/failure. A different
  publication uses directory-based fallback until its own rankings are ready;
  older request snapshots never consume newer rankings or trigger backwards loads.
- Cache essential profile data separately from related-composer selection. A warm
  profile immediately benefits from completed rankings on its next request, rather
  than caching fallback suggestions for the entire profile TTL.
- Preserve the existing 15-second SQL timeout and ranking policy. Core data
  endpoints still check publication readiness and return 503 when essential data
  is unavailable. Opening HTTP is not a claim that all data dependencies are ready.

Validation: built-server tests use disposable PostgreSQL and deliberately lock
`crawler_source` to block only recommendations. Listings and composer profiles
remain available while warm-up waits and after its actual SQL timeout; profiles
use fallback, and successful background completion improves a cached profile.
Missing database sockets, unpublished data, and a stalled database handshake no
longer prevent HTTP from opening. Maintenance still makes zero DB connections.
Unit tests cover single-flight loading, failure backoff/recovery, stale rankings,
publication changes, and sanitized errors. The full run with isolated discovery
fixtures and both startup flags passed 231 tests, with one opt-in alert suite
skipped. Both site builds/typechecks pass.
Recommendation SQL optimization remains a separate follow-up.

### Container health during deployment

The runtime Docker image now probes `GET /api/health` every 5 seconds, with a
2-second timeout, a 20-second startup grace period, and 3 retries. The inline Node
probe follows `NITRO_PORT`, then `PORT`, defaulting to 3000; no curl dependency is
needed. The endpoint returns `200 {"status":"ok"}` with `Cache-Control: no-store`.
It checks HTTP availability only, never PostgreSQL or recommendations. Exact GET
and HEAD requests remain allowed during maintenance so deliberate maintenance does
not cause container restarts. Other maintenance restrictions are unchanged.

After deployment, verify that CapRover/Swarm has enabled the image healthcheck and
that its `start-first` rollout keeps the old container serving until the new one
is healthy. This repository change does not alter or verify live service settings,
and the probe does not certify database readiness or guarantee zero downtime.

### Query plans and remaining performance gate

The initial production EXPLAIN ANALYZE pass was blocked by unpopulated views.
Published views subsequently became available for the bounded, read-only autocomplete
checks below. Other production query families still need realistic plan validation
before deployment. Do not attempt SELECT/EXPLAIN ANALYZE against unpopulated views.

Local EXPLAIN ANALYZE with buffers, on a fictional 55,002-member / 50,001-concert
fixture (unflushed caches, not production widths/distributions), measured:

| Read | Database execution |
| --- | ---: |
| 50-row ordered listing | 0.56 ms |
| Composer + work EXISTS filter | 12.65 ms |
| Distinct eligible source spellings | 24.55 ms |
| Narrow matching eligible member mapping | 21.39 ms |
| 100-row page restricted to mapped IDs | 2.83 ms |

A complete 100-row source API call on that fixture took approximately 100 ms.
These measurements are not production latency guarantees. Eligible source JSON
matching still scans the member dataset twice (spellings and matching mapping),
but count/page/detail reads no longer repeat that scan. There is not yet evidence
that a new backend index is mandatory. If realistic plans show a bottleneck,
request a **new** backend migration for an appropriate eligible source expression
index/normalized lookup; do not edit the deployed v1 migration.

### Autocomplete query regression follow-up

The switch exposed a bad plan in music facets: `jsonb_to_record` made PostgreSQL
estimate one composer group where execution produced about 15,000. The resulting
nested loop repeatedly scanned the identity catalogue. Scalar published-name
projections avoid that estimate; no registry-name fallback or count removal is used.
Work availability now groups and joins native work IDs, without reading JSON labels
or redundantly joining composer relationships (the publication already includes work
composers). Counts still use distinct resolved concert IDs.

City facets now combine historical raw labels and contextual raw counts in one grouped
query, joining only eligible IDs for availability. This avoids a second wide-row read
inside the single-connection snapshot. Historical labels are deliberately retained:
a past raw spelling can be an ambiguous alias of current canonical cities. Dropping
historical names outright would silently lose valid positive-count suggestions.

The follow-up suite passed **226 tests, with 2 unrelated opt-in suites skipped**,
including 18 disposable-PostgreSQL discovery tests. Both site typechecks passed.
New regressions cover the SQL query shapes, past-only ambiguous aliases, historical
label casing, availability modes, counts, and selection restoration on both scopes.

Read-only handler checks used the live publication, disabled the application data
cache, and enforced read-only connections with an 8-second statement timeout.
One final sample measured composer requests at 1.5–1.6 seconds, work requests at
1.2–2.2 seconds, and subsequent city requests at 1.6–1.7 seconds. The first city
request still took 5.5 seconds. These include database/network work but not browser
rendering or the UI debounce; shared load and database buffers vary. This removes
the pathological music plans, not every cold-read cost. Browser/human validation
remains outstanding. No production writes, schema changes, or refreshes were made.

## Source directory upgrade (2026-10-23)

This version additionally requires the backend source index and source-directory
migrations through `20261023000200`. Deploy the backend first and wait for a
successful publication with the populated `resolved_concert_source_url` view
before deploying this frontend. Readiness checks include that seventh view.
The backend keeps its hourly schedule; this upgrade does not trigger a refresh.

The API reads exact stored spellings from the small published directory, applies
the existing JavaScript normalization and source-alias rules, and performs the
same eligible-member lookup using those accepted spellings. This removes the
catalogue-wide JSON discovery scan from every cache miss. Keep both reads in the
existing repeatable-read transaction. Historical naming, donor matches, source
provenance, pagination, export serialization and caching are unchanged.

The new fixture SQL is copied verbatim from the backend migration; do not edit
the frozen policy-v1 fixture to add the new directory. Roll back this frontend
before removing the backend directory. Source-lookup work is isolated on branch
`perf/resolved-source-lookup`; unrelated composer work remains in the original
checkout.
