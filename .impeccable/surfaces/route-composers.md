---
version: 1
slug: "route-composers"
primary_target: "route:/composers"
related_targets: ["app/pages/composers/index.vue","app/pages/composers/[slug].vue"]
---

# Composer discovery

## Scope and intent

Read (interactive discovery): explore repertoire, optionally listen, then find a live performance. Routes are `/composers` and `/composers/<id>-<name>`. Preserve the incumbent English, light editorial interface. The directory selects the latest published public playlist per composer, ordered by upcoming concert count. The current ten are the implementation cohort, not a hard limit. Content comes from structured data; do not invent biographies or historical claims.

## Finished composition

The directory pairs a short introduction with an open artwork gallery: three columns from 1024px, two from 640px, one below. Each square cover leads to a name and concert count.

Details open with breadcrumb, composer name, worldwide count and Browse concerts. Desktop splits listening and repertoire at 1:1.9; mobile stacks them, with a compact artwork-and-text listening row. The 152px player loads only after Load player; an external playlist link remains available. Listening sticks only above 1024px width and 850px height.

Up to 20 work rows use fine rules, ordinals, titles, optional catalogue labels and concert counts; counts sit below titles on mobile. Related composers reuse the gallery. Fonts inherit Playfair Display and Lato. White surfaces and gray hierarchy remain unchanged. Scoped blue-600 actions reached 5.25:1 contrast on white in the supplied finish review. Focus outlines, hover underlines and reduced-motion support are implemented.

## Behavior and maintenance

- Work rankings count distinct upcoming public concerts independently of playlist tracks and season. Rows link by exact work ID (`/?works=<id>`). Copy explains that listening selections may differ from the ranking.
- Loading, retry and empty states are explicit. Missing composers return 404; stale name slugs redirect to canonical paths; service errors return 503 with noindex. Navigation and sitemap expose eligible composer routes.
- Directory and work rankings are cached separately for five minutes. Counts can briefly differ between sections or from concert listings.
- Local artwork uses `public/composers/2026-27/<id>-400.webp` and `-800.webp`, with adjacent provenance JSON. Update both sizes, provenance, and the exact-season cover mapping in `server/utils/composers.js` when maintaining assets. Unmapped composers or seasons show the name fallback; runtime image-request failures do not trigger that fallback.

The independent finish handoff reported **ship** after resolving its single contrast finding; screenshots are in `.impeccable/review/`. This brief records inspected source and the supplied review outcome. Global `DESIGN.md` and `.impeccable/design.json` remain outside scope.
