# ClassicalBot Web

Nuxt 4 frontend for discovering upcoming classical-music concerts worldwide. Concert ingestion and database migrations live in a separate project, `classical_bot`; this repository reads the shared PostgreSQL database.

## Technical notes

- Vue 3, Nuxt UI, Tailwind CSS 4, Knex, Objection, and PostgreSQL.
- Countries use ISO 3166-1 alpha-2 codes. `/` lists all upcoming concerts and `/countries/<code>` applies a country filter.
- Run `npm run dev`, `npm run build`, and read-only SQL with `npm run db:query -- --query "SELECT ..." --format table`.
- `.env` contains production credentials. Never open, print, or log it; let the runtime load it implicitly.
- Keep the restrained light editorial design and English interface. The crawler/database remains the source of truth for concert and source data.
