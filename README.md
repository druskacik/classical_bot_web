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
