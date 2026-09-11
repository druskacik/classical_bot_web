# ClassicalBot Web

English-language Nuxt 4 frontend for discovering upcoming classical-music concerts around the world.

Concert data is collected and maintained by the separate crawler project:

https://github.com/druskacik/classical_bot

Use Node.js 24 LTS, install dependencies with `npm ci`, and run the application with:

```bash
npm run dev
```

Validate the application and create a production build with:

```bash
npm run typecheck
npm test
npm run build
```

## Local Lighthouse audits

Run Lighthouse against a production build of the current checkout:

```bash
npm run lighthouse
```

Audit a specific application route with:

```bash
npm run lighthouse -- --path=/slovakia
```

The command builds the application once, starts the production server locally, and runs three mobile and three desktop measurements. Complete JSON and HTML reports are written to `lighthouse-reports/mobile/` and `lighthouse-reports/desktop/`. The command reports collection failures, but it does not fail because of low scores.

These are repeatable local lab measurements for troubleshooting code changes. They do not include the real-user Chrome UX Report data shown by PageSpeed Insights, and scores can vary slightly between runs.

Run the built application with `node .output/server/index.mjs`.

## Shared concert foundation

The root Nuxt application remains the ClassicalBot website. It extends the local
`layers/concerts` layer; development, build, Docker, and deployment entry points
are unchanged.

- `layers/concerts/app/`: concert components, composables, discovery utilities,
  and the shared editorial styles and Nuxt UI theme. `SiteNavbar`, `BrandLogo`,
  `BrandMark`, `SiteFooter`, and `EditorialArticle` provide both sites' common
  presentation. App wrappers supply navigation items, brand names, and translated
  labels; article pages supply their content and optional metadata.
- `layers/concerts/server/`: concert APIs, database connections/models, filtering,
  and the cached city catalogue.
- `layers/concerts/shared/`: city identity and canonical path construction.
- Root `app/`, `content/`, and `public/`: ClassicalBot pages, navigation data,
  editorial content, and public assets.
- Root `nuxt.config.ts`, `site.config.js`, and sitemap helpers/plugin: site identity,
  analytics, content module, and the global site's sitemap policy.
- `apps/classical-sk/`: the Slovak application, with its own routes, content,
  navigation, metadata, analytics, and sitemap.

The shared layer has no page routes or sitemap plugin. A consuming application
defines its own pages and sets `appConfig.concertSite.name` and
`appConfig.concertSite.origin` (see `app/app.config.ts`). The origin is required
for concert canonical URLs; it has no fallback to another website. Nuxt's root
application can override layer components and configuration.

Imports of layer-owned files use relative paths. Application code can use
`#layers/concerts/...`; plain Node tests use relative filesystem imports. Avoid
`~/` and `#shared/` for layer-owned files because those aliases resolve to the
consuming application.

The `#concert-site` module alias supplies build-time locale, country scope, and
city route policy. The layer defaults to the English global application; the
Slovak app overrides it with `apps/classical-sk/site.config.js`. This is fixed per
application build, not chosen by a query parameter or incoming hostname. All
listing, facet, country, city, composer, and source queries enforce that scope.
Facet exclusions cannot remove it. Each process has its own city cache.

## Server data cache

Both builds share a bounded in-memory cache for successful endpoint results.
It is used by browser API requests and Nuxt's internal requests during page
rendering; it does not cache HTML or add browser/Cloudflare cache headers.

| Endpoint | Result lifetime |
| --- | --- |
| `/api/get-concerts` | 2 minutes |
| `/api/get-concert-filter-options` | 2 minutes |
| `/api/get-countries` | 5 minutes |
| `/api/get-sources` | 5 minutes |
| `/api/get-composers` (legacy endpoint) | 5 minutes |
| classical.sk `/api/get-cities` | 2 minutes |

The cache is enabled when `NODE_ENV=production` and disabled otherwise. Set
`SERVER_DATA_CACHE_ENABLED=true` or `false` to override this at runtime. No new
production configuration is required. To bypass these caches during local
testing, or roll back caching in CapRover, set `SERVER_DATA_CACHE_ENABLED=false`
and restart the application. This switch leaves the pre-existing city catalogue,
composer-page, and sitemap caches unchanged.

Validation runs before lookup. Keys include the build's country, locale, city
route mode, and all relevant parsed filters, including pagination and selected
autocomplete values. Ignored parameters such as tracking tags do not create new
entries. Equivalent composer/work filter sets share entries. No request or
result data is written to disk.

Each server process retains at most 500 results and 16 MiB of serialized
key/result data, evicting the least-recently-used entries as needed. This is a
serialized-data budget, not a limit on total JavaScript heap usage. Entries over
1 MiB are not retained. Up to 100 distinct loads are tracked concurrently;
additional distinct requests run normally without caching. Requests for an
already tracked key still share its load. Retained and concurrent-load limits
are shared across these endpoints, with separate state in each process/replica.

Expiry starts when a result finishes loading and is not extended by reads.
Expired results are removed on cache access and during metric reporting. The
first request after expiry waits for fresh data, and simultaneous requests for
that key share the load. Successful empty results are cached; errors are not.
Failed refreshes return the endpoint's normal error rather than expired data,
and subsequent requests may retry. Restarts clear all entries; no warm-up is
required. There is no manual purge endpoint or connection to crawler updates.

The lifetime is a reuse window, not an exact end-to-end freshness guarantee:
query duration and the existing five-minute city catalogue cache also contribute.
Changes in `CURRENT_DATE` can remain unseen until the result expires. Existing
composer and sitemap freshness behavior is unchanged.

Every five minutes, `[server-data-cache]` logs aggregate counters by endpoint
namespace: `hits`, `misses` (tracked loads), `shared` (joined loads),
`loadFailures`, `evictions` (capacity removals), and `bypasses` (disabled,
capacity-limited, or oversized operations). Oversized loads can count as both a
miss and a bypass. Counters reset after reporting; `retainedEntries` and
`retainedBytes` report current gauges. Logs contain no keys, filters, result
contents, or credentials. The reporting timer is stopped on application shutdown.

Validate with `npm test`, both type checks, and both builds. For a production
smoke test, start both preview servers and request the same concert, country,
source, and filter API URLs twice, plus `/` on both sites and the Slovak city
directory. Responses must retain their existing shape and geographic scope;
the next metrics summary should show hits after initial misses. Repeat with the
switch disabled to confirm bypasses. After deployment, compare load counts,
database activity, and response times under comparable traffic before claiming
a production improvement. These changes do not deploy either site.

## Run both websites locally

Install dependencies once at the repository root with Node.js 24 and `npm ci`.
Use two terminals, both at the repository root:

```bash
# Global website: http://localhost:3000
npm run dev
```

```bash
# Slovak website: http://localhost:3001
npm run dev:sk
```

Both commands load the existing root `.env` through the runtime. Do not copy it
into the Slovak app. The apps have separate build directories and can run at the
same time. Override ports with `-- --port 3002` if necessary.

For production-mode local testing:

```bash
npm run build
npm run build:sk
npm run preview -- --port 3000
# In another terminal:
npm run preview:sk
```

The global output remains `.output`; Slovak output is
`apps/classical-sk/.output`. `npm run typecheck` checks the global app;
`npm run typecheck:sk` checks the Slovak app; `npm test` checks shared behavior,
geographic restrictions, URL identity, sitemap scope, and translations.
With both servers running, `npm run test:sites` exercises pages and APIs on ports
3000 and 3001 (override with `GLOBAL_SITE_URL` and `SLOVAK_SITE_URL`).

The Slovak routes are `/`, `/<local city name>` (including accents and spaces),
`/kontakt`, `/zdroje`, `/blog`, and `/blog/<slug>`. Known unresolved city names from
historical Slovak concerts remain routable, such as `/Pezinok`; arbitrary and
foreign city names return 404. Legacy `?skladatelia=...` links redirect to
`?composers=...`, preserving the city and other filters. The original article is
stored in `apps/classical-sk/content/o-projekte.md`. Add new article URLs to
`apps/classical-sk/shared/utils/sitemap-inventory.js` when adding content.

The Slovak source list is generated from public upcoming Slovak concerts, including
international platforms that contribute those concerts. City pages use Slovak
names and dates. The shared UI provides English and Slovak copy without changing
concert titles or composer names from the database.

These commands do not deploy either app. Switching the live classical.sk
deployment is a separate step.

## CapRover deployments

Both CapRover apps use this repository as their build context. In each app's
Deployment tab, select the corresponding **Captain Definition Path**:

| Website | Captain Definition Path | Dockerfile |
| --- | --- | --- |
| classicalbot.com | `./captain-definition` | `Dockerfile` |
| classical.sk | `./captain-definition-classical-sk` | `Dockerfile.classical-sk` |

CapRover supports separate definitions for apps in one repository; all Dockerfile
paths are relative to the repository root. See the
[CapRover monorepo documentation](https://caprover.com/docs/captain-definition-file.html#monorepos).

For each existing CapRover app:

- Use the same repository and intended release branch, with the definition path
  from the table. Keep the existing custom domain and HTTPS settings.
- Set **Container HTTP Port** to `3000` for both apps. The Slovak development
  port `3001` is only a local convenience.
- Supply `NUXT_DB_HOST`, `NUXT_DB_PORT`, `NUXT_DB_NAME`, `NUXT_DB_USER`, and
  `NUXT_DB_PASS` as runtime environment variables in CapRover. Preserve the
  existing database configuration; these values are not build arguments.
- If using automatic repository deployments, configure the generated webhook
  for each app separately. A shared-code push must trigger both apps to update
  both websites.

Each multi-stage image installs from the root lockfile and builds one application.
The final image contains only that app's `.output`, runs as the `node` user, and
listens on `0.0.0.0:3000`. No `.env` file is copied into either image, and no
database migration runs during build or startup. Content is bundled with the
application; these frontends do not require persistent volumes.

To build the images locally from the repository root:

```bash
docker build -f Dockerfile -t classicalbot-web:local .
docker build -f Dockerfile.classical-sk -t classical-sk-web:local .
```

Deploy each image to its matching app: the domain alone does not select the site
variant. These files do not change the live CapRover settings or trigger a deploy.

For read-only database inspection, use:

```bash
npm run db:query -- --query "SELECT COUNT(*) FROM classical_concert;" --format table
```

The runtime loads database configuration from `.env`; never print or commit that file.

## City pages and sitemap

Every canonical city has a `/<country>/<city>` route, including cities with no upcoming concerts. Slugs use the canonical English name and existing country names. Within a country, the lowest city ID owns a colliding bare slug; other cities get ID suffixes, avoiding natural-name collisions. URLs do not depend on concert counts, but canonical name changes can change URLs (there is no persisted alias registry).

Clean city pages with at least one public upcoming concert are indexable. Empty city pages and all query-string variants are `noindex, follow` without a canonical tag. The city and country are fixed by the path; query parameters cannot override them.

`/sitemap.xml` includes the homepage, About, Contact, Sources, active countries, and cities with at least 10 public upcoming concerts. Public means `date >= CURRENT_DATE`, included, and not a duplicate; city inventory additionally matches the canonical city's resolved country. The threshold lives in `shared/utils/sitemap-inventory.js`.

The sitemap module's runtime hook builds the explicit inventory; automatic page discovery is disabled. The cache interval is configured to one hour, but this is not a freshness guarantee: the module caches both resolved URLs and generated XML, using stale-while-revalidate (serving cached data while refreshing in the background). An XML refresh can reuse stale URL data, so concert changes can take longer than an hour to appear, depending on requests and refresh success.

A failed refresh cannot publish a partial inventory: an existing good cache may be served, otherwise generation returns 503. The city catalogue has a separate five-minute in-process identity cache. No build-time database snapshot or scheduled generation is required.

## Contact form

The global site's `/contact` form posts to `/api/contact` and sends a plain-text
email through authenticated SMTP using Nodemailer. No submissions are saved in
the database. SMTP credentials and message contents are never logged or exposed
in API responses. The visitor's address is used only as `Reply-To`; the sender
and recipient are controlled by the server.

Supply these **runtime** environment variables (local development loads `.env`
implicitly; configure production values in CapRover):

| Variable | Meaning |
| --- | --- |
| `SMTP_HOST` | SMTP hostname |
| `SMTP_PORT` | Port, default `587` |
| `SMTP_SECURE` | `true` for implicit TLS (usually 465), `false` for required STARTTLS (usually 587) |
| `SMTP_USER` | SMTP login; also default sender address and recipient |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Display name, email address, or `ClassicalBot <contact@example.com>`; default name `ClassicalBot` |
| `SMTP_TO` | Optional single recipient address; defaults to `SMTP_USER` |
| `CONTACT_TRUST_PROXY_HOPS` | Default `0`; see proxy setup below |

If the SMTP login is not an email address, explicitly set a full `SMTP_FROM`
and `SMTP_TO`. Use a sender your provider authorizes, with its required domain
SPF/DKIM configuration. SMTP transport requires TLS with certificate validation.
`SMTP_SECURE=false` does not permit unencrypted delivery.

Ethereal accounts capture test messages without delivering to real inboxes.
Inspect them in the Ethereal account. Switch to a real SMTP provider and recipient
before launching publicly; test delivery and Reply-To there as well.

Abuse controls include a honeypot, strict origin and JSON checks, a 32 KiB streamed
body limit, field validation, five submission attempts per IP per 15 minutes,
30 SMTP attempts per hour globally, and at most three concurrent SMTP sends.
Limits are held in bounded process memory, reset on restart, and apply separately
to each replica. Use a shared limiter or proxy-level limits before scaling beyond
one process. Failed sends count toward the sending cap. No automatic retries or
autoresponses are sent. SMTP acceptance is reported as success, not a guarantee
of inbox delivery. An ambiguous connection failure can still have delivered mail;
manual resubmission can produce a duplicate.

By default, IP limits use the socket peer, ignoring forwarded headers. Behind a
proxy this groups clients together until proxy trust is configured. For a single
CapRover nginx proxy, set `CONTACT_TRUST_PROXY_HOPS=1` **only after verifying** that
nginx appends/overwrites `X-Forwarded-For` and that the app port cannot be reached
directly from the public internet. For multiple proxies, configure the exact
trusted hop count. Do not trust arbitrary client-supplied forwarded prefixes.
The global SMTP cap applies regardless of IP trust settings.

Production accepts the origin from `site.config.js`; local development additionally
accepts HTTP localhost/127.0.0.1 origins. The endpoint requires an Origin header.
Run contact validation and HTTP integration tests with `node --test test/contact.test.js`.
