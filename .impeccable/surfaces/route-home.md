---
version: 1
slug: "route-home"
primary_target: "route:/"
related_targets: ["app/pages/index.vue", "app/pages/[country]/index.vue", "app/pages/[country]/[city].vue", "apps/classical-sk/app/pages/index.vue", "apps/classical-sk/app/pages/[city].vue", "layers/concerts/app/components/concert-list-page.vue", "layers/concerts/app/components/concert-filters.vue", "layers/concerts/app/components/concerts-table.vue", "layers/concerts/app/components/concert-programme.vue"]
---

# Shared concert discovery

Routes: `/`, country and country/city pages, and Classical SK concert-list routes. Mode: Operate.

## Intent and scope

The user chose focused discovery: prominent filters and richer programme details. Place, date, and music choices lead into chronological concert entries. The existing Quiet Programme identity supplies Playfair Display, Lato, white, gray, and blue; this is the shared concert-list composition. All list, filter, table, and programme components render it directly; no `ledger` prop or alternate presentation remains. Country and city restrictions still come from their route props.

## Composition and actual values

- Outer container: at most 80rem; heading and concert content: at most 72rem. Top padding is 2.5rem, or 1.5rem below 640px; bottom padding is 4rem. Heading-to-filters spacing is 2rem, or 1.5rem below 640px.
- Centered Playfair Display heading: regular, 2.25rem/1.2, reducing to 1.875rem below 640px on country/city pages and 1.5rem/2rem on the homepage. Month heading: 1.5rem/2rem with a one-pixel gray-900 bottom rule.
- Filters retain the original transparent, unboxed ground and vertical padding, with no added heading or enclosing rules. Labels and input placeholders use gray-600. Focus uses a single two-pixel blue underline on autocomplete and country/date fields; the surrounding focus ring is removed.
- Country, City, and When form three columns from 768px, or two when the route fixes the country and hides its selector; Composer and Work form two. Below 768px, music fields stack behind the “Composer or work” disclosure, initially expanded when either has a selection. No separator divides date and music filters.
- Result summary and Map sit between filters and the month heading. Catalogue counts and concert data remain runtime facts, not fixed copy.
- White open concert rows have fine horizontal separators, no enclosing border, no shadow, and no hover wash. Vertical padding is 1.75rem, or 1.5rem below 640px. Dates use a 5rem column and 1.5rem gap, reducing to 2.75rem and 1rem below 640px.
- Date hierarchy: Lato weekday at 0.875rem/1.5 in gray-600, tabular day at 2.25rem/1.15 in gray-900 (1.875rem below 640px), and time below. Regular Playfair Display concert titles stay 1.5rem/1.35 on both desktop and mobile.
- City and country retain the existing deterministic colored outline badges, rendered with regular 1px borders rather than inset rings. Linked badges use a 5% tint of their text color on hover, with 150ms background feedback and no underline; keyboard focus retains its outline. Gray-600 source text accompanies them in a wrapping row with 0.5rem gaps. Coarse-pointer metadata links have 2.75rem minimum targets.
- From 640px, programme starts after a 1rem margin and 0.75rem top padding with a gray-200 rule. On mobile, programme uses the same 0.5rem content gap as composer-only lists, with no extra margin, padding, or rule. Composer names use gray-700, semibold below 640px and regular from 640px in both programme rows and composer-only lists; work links are gray-900. From 640px, each group has an 11rem composer column and a 1.5rem gap; below it, works stack under the composer with a 0.75rem indent. Text wraps naturally and coarse-pointer programme links retain 2.75rem minimum targets.

## Behavior and access

Filtering updates the URL and results; removable selections, date presets, radius controls, map context, pagination, programme links, clear/retry actions, and empty-state recovery remain available. Missing works do not create an empty programme block. The shared list page sets `--ui-primary` to `--color-blue-600` and uses two-pixel keyboard focus outlines with a three-pixel offset.

Pagination controls are 44 × 44px, with Lucide arrow-left/right icons, accessible names, an explicit current-page border, and disabled states. Page changes move focus to the results summary. Border/text feedback takes 150ms; results update opacity over 200ms. Reduced-motion preferences disable concert-list transitions and request immediate JavaScript pagination scrolling; ordinary pagination scrolls smoothly. There is no entrance animation.

## Evidence and review boundary

Ground truth: `app/pages/index.vue` and `layers/concerts/app/components/{concert-list-page,concert-filters,concerts-table,concert-programme}.vue`; captures in `.impeccable/review/desktop.png`, `mobile-top.png`, and `mobile-concert.png`. The direction was recorded in `/tmp/home-direction.md` (seed 9efe19d6; selected Date ledger).

`.impeccable/review/home-finish.md` identified pagination motion and icon fixes; `home-verdict.md` resolves both with disposition **ship at fix-list scope**. This is not a claim of a comprehensive accessibility audit. Parent validation reports build, typecheck, 22 existing test files, and desktop/mobile filtering, map, empty-state, and pagination checks passing. Development toolbar overlays in review captures are not product UI.
