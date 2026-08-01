# ClassicalBot Web

English-language Nuxt 3 frontend for discovering upcoming classical-music concerts around the world.

Concert data is collected and maintained by the separate crawler project:

https://github.com/druskacik/classical_bot

Run the application with `npm run dev` and create a production build with `npm run build`.

For read-only database inspection, use:

```bash
npm run db:query -- --query "SELECT COUNT(*) FROM classical_concert;" --format table
```

The runtime loads database configuration from `.env`; never print or commit that file.
