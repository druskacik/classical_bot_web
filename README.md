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
