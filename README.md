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

Run the built application with `node .output/server/index.mjs`.

For read-only database inspection, use:

```bash
npm run db:query -- --query "SELECT COUNT(*) FROM classical_concert;" --format table
```

The runtime loads database configuration from `.env`; never print or commit that file.
