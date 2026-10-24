# Concert API v1

The public, unauthenticated endpoint is `GET /api/v1/concerts`. It returns upcoming concerts filtered by organisation website, country, city, performer and/or venue. Discover entity IDs with `GET /api/v1/cities`, `/api/v1/performers` and `/api/v1/venues`. When a `url` is supplied and registration is enabled, the concert GET also validates and queues unknown websites for crawler creation; it does not synchronously crawl them. Requests without `url` and all entity lookups are read-only. Deploy the application before using the production examples below; implementation alone does not publish the endpoint.

```sh
curl --get 'https://classicalbot.com/api/v1/concerts' \
  --data-urlencode 'url=https://www.ceskafilharmonie.cz/'

curl --get 'https://classicalbot.com/api/v1/concerts' \
  --data-urlencode 'url=https://www.ceskafilharmonie.cz/' \
  --data 'format=csv' --data 'all=true' --output concerts.csv
```

For local testing replace the origin with `http://localhost:3000`. The machine-readable contract is [openapi.json](./openapi.json), kept in this repository rather than served publicly. Share the file directly with the customer when needed.

## Parameters and responses

| Parameter | Meaning |
|---|---|
| `url` | HTTP(S) organisation URL, maximum 4096 characters; a bare hostname is accepted |
| `country_code` | Two-letter ISO country code; case-insensitive, normalized to uppercase; concert location, not performer nationality |
| `city_id` | Exact canonical city ID returned by city lookup |
| `performer_id` | Exact credited performer ID; includes people, conductors and ensembles, without inferred ensemble membership |
| `venue_id` | Exact venue/hall ID; a parent building does not implicitly include its halls |
| `format` | `json` (default) or `csv` |
| `page` | Positive integer, default 1, maximum 1000000 |
| `page_size` | 1–100, default 50 |
| `all` | `true` or `false` (default); true cannot accompany page/page_size |

At least one of `url`, `country_code`, `city_id`, `performer_id` or `venue_id` is required. Supplied filters combine with **AND**. IDs are positive decimal strings in the PostgreSQL bigint range (maximum `9223372036854775807`); do not convert them to JavaScript numbers. Unknown IDs and contradictory filters return 200 with an empty collection, not 404. City matching does not expand to nearby cities or metro areas. Filters use published, resolved concert identities and country (raw country fallback when unresolved), including accepted details from deduplicated records; missing identities do not match ID filters.

```http
GET /api/v1/concerts?performer_id=123&country_code=DE
GET /api/v1/concerts?city_id=789&venue_id=456
GET /api/v1/concerts?url=https%3A%2F%2Fexample.com%2F&performer_id=123&format=csv
```

Unknown or repeated parameters are rejected. Format is selected explicitly by the parameter, not the Accept header. Both formats select the same records. Complete exports are capped at 10000 concerts and serialized responses at 20 MiB; oversized requests fail instead of truncating. Use pagination when a complete export is too large.

JSON contains `source` (`id`, `name`, `url`, `status`, `next_attempt_at` when filtering by URL; otherwise null), `concerts`, `pagination` (`page`, `page_size`, `total`, `total_pages`, `all`, `next`) and `generated_at`. In complete exports the page-related values and next link are null. CSV contains only the concert table. Both formats expose `X-Total-Count` and, when applicable, `Link: <...>; rel="next"`. Next links are relative to the API origin and retain all filters and the selected format. Pages beyond the result set are empty.

Upcoming means concert date >= the current UTC date, including today's concerts even if their local start time has passed. Sort order is date, local start time (unknown last), then ID. Cancelled, postponed, and rescheduled records retain their status; clients can decide whether to display them. Dates are `YYYY-MM-DD`; times are local `HH:mm:ss` without an inferred timezone. Absolute timestamps are ISO 8601 UTC. Each response reads a consistent database snapshot; separate pages may reflect ingestion changes. Cached results can be up to 120 seconds old; `generated_at` identifies when the data was loaded, not when a concert was verified.

## Same fields in JSON and CSV

CSV headers are the same snake_case names as the JSON concert properties, in a fixed order. Every field is present in both. Null scalars become blank CSV cells; empty collections remain `[]`. Identifiers and decimal prices are strings in JSON. Coordinates are numbers. Text summaries are for display, not for parsing: use the detail arrays for integrations.

| Customer column | Field | Meaning |
|---|---|---|
| Artist(s) Name | `artists` | Unique credited performer names in source display order, separated by semicolons |
| Date | `date` | Concert calendar date |
| Time | `time` | Local start time |
| Venue Name | `venue_name` | Canonical venue/hall name; original concert venue when unlinked |
| City | `city` | English city name, with local/raw fallback |
| State | `state` | Currently null: state/region is not stored |
| Country | `country` | English country name |
| Venue | `venue_address` | Street address: provisional interpretation requiring customer confirmation |
| Buy Link | `buy_url` | Stored occurrence-specific purchase/reservation link; no homepage fallback |

The first nine fields follow that order. The remaining fields are:

- `id`, `title`, `event_url`, `end_time`, `event_status`, `last_verified_at`.
- `country_code` (ISO alpha-2), `city_id`, `venue_id`, `venue_url`, `parent_venue_name`, `latitude`, `longitude`. Coordinates describe the venue only; parent-building and city coordinates are not substituted.
- `programme` and `programme_items`: composer/work summaries plus structured work ID, title, source `programme_label`, catalogue number and composer identity. Programme order is deterministic, not a claim about performance order.
- `composers`: identities, including known composers without a known work.
- `performers`: ID, name, kind, roles, instruments, voice type, character, ensemble association, qualifier and identity URL. These are all credited performers, including conductors and ensembles. `artists` is derived from this array.
- `prices` and `price_items`: readable summaries and every stored offer. Details preserve `exact`/`from`/`range`, admission/fee/suggested donation, decimal amounts, currency, category, audience, conditions and basis. Amounts are not converted between currencies or collapsed into a single headline price.
- `admission_type`, `booking_kind`, `booking_status`, `on_sale_at`. Missing prices do not imply free admission. A missing buy link does not override independently recorded booking status.
- `source_id`, `source_name`, `source_url`, `source_event_urls`: with a URL filter, the resolved organisation identity and its matched event links (unchanged). Without a URL filter, each concert is attributed to its eligible primary occurrence, or the lowest-ID eligible member if the primary is not eligible. Its stored source name is retained; an unambiguously registered exact source URL supplies the canonical URL and ID. Unregistered or ambiguous sources retain their stored URL with a null `source_id`. `source_event_urls` then contains links from **all** eligible occurrences of that concert. The primary `event_url` can belong to a different source after deduplication.

For example, `programme` might be `Beethoven — Symphony No. 7; Ravel — Boléro`. `programme_items` is an array in JSON and the same JSON array encoded inside one CSV cell. Performers, composers, prices and source event links follow the same rule. CSV consumers can ignore the structured columns when they only need the readable table.

CSV uses UTF-8 with a BOM, comma separators, quoted fields and CRLF records. Quotes inside cells are doubled. One record represents one concert, even when a quoted cell contains newlines. To prevent spreadsheet formulas, scalar strings starting with `=`, `+`, `-`, `@`, tab, CR or LF (including leading whitespace) receive a leading apostrophe in CSV only. JSON strings and JSON inside structured CSV cells are unchanged. Formula protection is the only intentional scalar-text transformation between formats.

## Entity discovery

```http
GET /api/v1/cities?q=prague&country_code=CZ
GET /api/v1/performers?q=eva&has_upcoming=true
GET /api/v1/venues?q=konzerthaus&country_code=DE
GET /api/v1/venues?q=hall&city_id=789
```

These endpoints return JSON only, with `{ items, pagination, generated_at }`. Pagination has `page`, `page_size`, `total`, `total_pages`, `next`; headers expose `X-Total-Count` and `Link`. Empty matches and out-of-range pages return 200 with `items: []`. The endpoints do not register sources or create entities.

| Parameter | Meaning |
|---|---|
| `q` | Required nonblank search text, maximum 200 characters |
| `country_code` | Optional country restriction on cities and venues; not supported on performers |
| `city_id` | Optional exact city restriction on venues only |
| `has_upcoming` | `true` or `false` (default); true restricts results to identities linked to at least one published upcoming concert |
| `page` | Positive integer, default 1, maximum 1000000 |
| `page_size` | 1–100, default 20 |

Search uses normalized, case-insensitive and accent-insensitive substrings: canonical names and stored aliases for performers/venues; English and local names for cities. No typo correction, transliteration, or inferred aliases. Cities preserve punctuation in search text; performer/venue search follows the crawler's normalized-name convention. SQL LIKE metacharacters are not wildcards. Exact matches rank before prefixes, then other substrings, followed by display name and ID for deterministic ordering. An entity matching several aliases appears only once. By default, entities without upcoming concerts remain discoverable. `has_upcoming=true` uses the same exact city/venue/credited-performer semantics as concert filtering.

Every item includes an ID string and display name, plus available disambiguation fields (unknown values are null):

- **City:** `id`, `name` (English, local fallback), `local_name`, `country_code`, `latitude`, `longitude`, `external_source`, `external_id`. Use `id` in `city_id`; an external GeoNames identifier is separate and must not be substituted.
- **Performer:** `id`, `name`, `kind`, `ensemble_type`, `identity_url`. Instruments and roles are concert credits, not canonical identity attributes, so remain in concert details.
- **Venue:** `id`, `name`, `country_code` (city fallback), `city` (`id`, `name`, `country_code`) or null, `address`, `identity_url`, `latitude`, `longitude`, `parent_venue` (`id`, `name`) or null.

Entity IDs are the existing canonical database IDs; this MVP does not add permanent aliases or redirects for merged/deleted identities. Lookup reads a consistent snapshot, but a later concert request can reflect newer ingestion. There is no country search endpoint: use ISO alpha-2 codes directly.

## Source matching and deduplication

Registered canonical URLs and aliases are matched first, normalizing HTTP/HTTPS, www, default ports, host case and fragments while retaining meaningful paths and query strings. An otherwise unmatched URL can resolve by hostname only if that hostname belongs to one registered source. No submitted URL is fetched. Unknown hosts enter onboarding when enabled, otherwise return 404; ambiguous hosts return 422 with candidate canonical URLs and never create a source.

Source merges and concert duplicate chains are followed. The included, upcoming primary concert is returned once with its own enriched details; organisation links from matching duplicate records are retained. Details are not heuristically merged across duplicates. Missing fields stay null or empty without special treatment based on extraction coverage.

## Errors and operations

Errors always use JSON: `{ "error": { "code": "...", "message": "...", "details": {} } }`; details are optional.

| Status | Codes |
|---|---|
| 400 | `invalid_url`, `invalid_format`, `invalid_parameter` |
| 404 | `source_not_found` |
| 422 | `invalid_website`, `ambiguous_source`, `export_too_large` |
| 429 | `rate_limited`, `submission_limit` (with Retry-After seconds) |
| 500 | `internal_error` |
| 503 | `dns_unavailable` |

An active organisation with no upcoming concerts returns 200 and an empty collection/header-only CSV. Other registry statuses follow the onboarding rules below. GET and OPTIONS allow public CORS without credentials; pagination/download headers are exposed.

Limits are per process and shared across all four v1 endpoints: 60 requests/minute/IP, including at most 5 complete exports; at most 2 complete-export database loads run concurrently. Identical concurrent requests share a cache load. The cache is bounded and oversized entries are not retained. Lookup results also use a 120-second bounded cache and the published serving snapshot. A missing publication returns 503 `catalogue_unavailable` (also on lookup endpoints); registration DNS failures can also return 503. Database statements time out after 15 seconds. Logs contain status, format, result count and duration, not submitted URLs, extracted evidence, or database error messages.

`BUSINESS_API_TRUST_PROXY_HOPS` defaults to 0 (socket peer). Set it to the verified reverse-proxy hop count only when the application port cannot be reached directly. Never blindly trust forwarded IP headers. Limits are not shared between replicas and reset on restart; a distributed limiter is outside this proof of concept.

Before deployment run `npm test`, `npm run typecheck`, and `npm run build`. PostgreSQL integration tests launch a temporary local cluster when `initdb`/`pg_ctl` are installed, without loading application credentials. Validate a rich source and a duplicate-heavy source read-only, inspect query plans, and confirm proxy configuration. Deploy separately; then smoke-test JSON, complete CSV, headers and error responses and monitor API duration/error logs. Database schema migrations remain owned by classical_bot.


## Onboarding through GET

Set `BUSINESS_API_REGISTRATION_ENABLED=true` to enable registration (disabled by default).
Unknown websites must have a public DNS hostname on standard HTTP/HTTPS ports. The API
resolves IPv4 and IPv6 addresses within three seconds and rejects empty or non-public
results, IP literals, and local/reserved names. No HTTP request is made. DNS does not
prove musical relevance, prevent DNS changes after submission, or secure downstream
crawler fetches. Temporary DNS failures return 503; invalid destinations return 422.
Neither creates records. Existing registered sources are looked up without DNS validation.

New sources receive priority **100**, status `pending`, unknown geography, and no crawler
path. Submitted protocol and www are retained in the canonical URL; normalized identity
is used for matching. Registration and the submitted alias are atomic and duplicate-safe.
When registration is enabled, requests for existing sources in `pending`, `processing`,
`pr_open`, `retry_wait`, or `active` status raise their priority to at least **100**, preserving
higher values. Aliases and duplicate URLs promote the resolved primary source only. This
also happens when concert results are cached and does not consume new-submission quotas
or require DNS validation. Repeated requests do not rewrite already promoted sources,
reset status, or change retry timing. `blocked`, `disabled`, and `needs_attention` sources
are unchanged. Disabling registration keeps existing-source lookups read-only.

When no concerts exist, `pending`, `processing`, `pr_open`, and `retry_wait` return 202 JSON
with the regular response envelope, current source status, a message, and `Retry-After: 60`.
This also applies to `format=csv`. Repeat the same request to poll. `blocked`, `disabled`,
and `needs_attention` with zero concerts return 200 JSON with a status message. Once
concerts exist, they are returned in the requested format regardless of registry status.
`X-Source-Status` is exposed through CORS on both formats. `active` only indicates crawler
availability, not finished ingestion or enrichment. There is no promised completion time.
Registry status bypasses the concert cache; concert results can still be 120 seconds old.

Submission defaults, configurable with positive integer environment variables:

- `BUSINESS_API_SUBMISSIONS_PER_IP_HOUR=10`: unknown-source submissions that pass website validation, per process;
  resets on restart. Configure trusted proxy hops before enabling behind a proxy.
- `BUSINESS_API_SUBMISSIONS_PER_DAY=50`: successful new registrations per UTC day, persisted
  through source timestamps and `business_api` alias provenance. Shared across replicas,
  with a database advisory lock enforcing the cap. Existing sources remain accessible.

Registration needs SELECT/INSERT on `crawler_source` and `crawler_source_url`, plus access
to their ID sequences and UPDATE(priority) on `crawler_source`. Grant the update permission
before deploying this change. Disable registration to stop new submissions and priority
promotion while keeping lookup and exports working. No schema migration or bulk backfill
is required; existing sources are promoted on request.

Deploy the `classical_bot` analysis-priority changes first, then the web application, verify
DB grants and proxy settings, and enable registration explicitly. Both analysis queues use
registry priority permanently, falling back to 0 for unmatched or conflicting URL identities.
Programme selection keeps date/ID order within each tier; classification keeps its existing
source ordering within a tier. Running batches finish before new priorities take effect.
Priority does not accelerate initial crawling or bypass retry delays. Smoke-test onboarding
only with an intentionally chosen new source: the GET has database side effects when enabled.
