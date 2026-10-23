# Serving catalogue cutover

This branch replaces runtime `resolved_*` consumers with the PostgreSQL `serving`
publication introduced by backend migration `20261023000300`. Deploy the backend
first and wait for a successful concert generation and source-registry publication.
Deploy both sites and the alert worker together. No additional environment settings
are required. Do not deploy this branch against a database without the new schema.

`withServingSnapshot` establishes a read-only repeatable-read transaction, reads the
active generation, and pins it with transaction-local `serving.generation`. The
`serving.current_*` views are simple indexed generation filters, not aggregations.
All related reads use that transaction. Missing/unpublished data returns a controlled
503. Alert activation pins its write-transaction generation while holding a shared
lock on the publication pointer, so baseline creation cannot race cleanup.

The business API uses an indexed persistent URL/hostname registry, counts and pages
narrow concert rows, then reads prepared documents only for those IDs. It retains
JSON/CSV contracts, decimal price strings, source-event URLs, pagination and export
limits. Source status and priority remain live; newly submitted sources enter the
lookup in the same transaction. A background 60-second registry update is independent
of hourly concert builds. A stale source root returns a retriable 503 during a merge.

Common global/country/date autocomplete contexts use exact daily count tables;
complex combinations use narrow relation tables. City ambiguity, historic aliases,
selected-item restoration, mixed-composer works and zero-count catalogue entries
retain their existing behavior. Published composer identities stay aligned with
concert filters; catalogue-only composer edits remain live. Response caches are
optional, generation-aware accelerators. They are not needed to prepare a publication.

Rollout acceptance must measure first requests with response caches disabled, for
both sites: URL API (including large sources), city/composer/work suggestions,
combined filters, maps, composer pages, sitemap inventory, and alert activation and
representative changes. Compare results and counts with the old frontend. Local
integration tests do not establish production network latency or storage capacity.

The backend initially continues legacy publication. Only after frontend verification
should the operator switch its input mode to `direct`. Keep old views through two
successful direct generations and live acceptance. Legacy removal is a separately
acknowledged backend command, not part of this branch. The backend rollout guide is
`deployment/serving-catalogue.md`. Before removal the old frontend is available for
rollback; after removal it requires recreating and refreshing old views first.

Frozen schema/projection fixtures in `test-support/serving-*.sql` mirror the backend
migration and projection. Keep them synchronized when changing the contract. The
old resolved fixture remains only to exercise policy/publication parity in tests.
