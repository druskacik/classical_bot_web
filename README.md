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
