# City radius and concert map

ClassicalBot and Classical SK share these controls and retain the existing **Quiet Programme** design in `DESIGN.md`: a restrained light surface, editorial typography, and compact filters.

## City radius

**Radius** is a compact pill inside the right edge of the **City** field, sharing its label and underline. It is disabled until a city is selected. **+ 0 km** (zero or an unset radius) applies the existing exact-city filter. Presets are **25, 50, 100, 200, and 500 km**; **Custom…** accepts whole numbers from **0–500 km** inside that same pill and applies them with the check button or Enter. Escape cancels the edit; saved custom values return to a `+ 42 km` pill. Custom editing adds no extra form row. Presets apply immediately. Clearing the city clears its radius.

Positive radii measure approximate straight-line distance from stored city coordinates, not venue locations or travel distance. Concerts without a matching city with valid coordinates are excluded. Classical SK always restricts results to Slovakia. Date, composer, and work filters continue to narrow the results.

Changing city or radius navigates to `/`, clears conflicting location filters and map bounds, and resets pagination while preserving music and date filters. These URL forms are shareable:

```text
/?city=<city-id>
/?city=<city-id>&radius=50
/?city=Vienna,AT&radius=100
```

The API accepts an unambiguous city name (optionally followed by its country code) or city ID. A positive radius requires a resolvable city with coordinates. Invalid, fractional, or out-of-range radii return HTTP 400, as do positive-radius combinations with `country` or `cityId`. Empty areas return no concerts. The older `nearCity` or `nearLat`/`nearLng` plus `radiusKm` URL forms remain supported for existing links; they cannot be mixed with the new radius format.

## Explore map

**Explore map** opens the separate `/map` page. On desktop its dedicated layout allocates the viewport between navigation, filters, the map/programme workspace, and a compact footer; the programme scrolls inside its column. The centre row uses a zero minimum to prevent concert-list content from expanding the map. The page stays within the dynamic viewport on all screen sizes; only the programme scrolls during browsing. On phones the map and programme share the remaining height, and a filter disclosure opens the controls over the map instead of shrinking the browsing area. The map browses all upcoming concerts with valid city coordinates, subject to the selected dates and music filters and the site's country restriction. **Go to city** searches coordinate-bearing cities worldwide on ClassicalBot and only Slovak cities on Classical SK, then recentres the map. The autocomplete endpoint applies the site restriction to searches, restored selections and origin lookups. Selecting a city marker shows that city's paginated programme; **Show area** returns to the visible map area. Nearby city markers combine into clusters whose labels sum their concert counts; selecting a cluster zooms in. Markers represent city locations, not individual venues. Map result previews show up to three composer–work lines when there are at most three composers; longer programmes link to the full programme on the source page. Four or more composers use a names-only summary.

`GET /api/get-concert-map` returns city-level aggregates (`items`) and `total`, `mapped`, and `unmapped` concert counts for the current filters. The programme uses `GET /api/get-concerts`. The map's total count covers all mapped cities matching the date/music filters; the programme count covers the visible bounds or selected city. Concerts without coordinates are excluded from the geographic view.

Map and list navigation preserve `dateFrom`, `dateTo`, `datePreset`, `composers`, and `works`. Date presets also write their concrete date range to the URL. Map movement updates shareable bounds, and marker selection uses the same `city` filter as the list:

```text
/map?bounds=14,47,18,50
/map?city=Bratislava,SK&bounds=14,47,18,50
/?bounds=14,47,18,50
```

Bounds are ordered **west,south,east,north**, with longitude in −180–180 and latitude in −90–90. South must be less than north; west and east must differ. **West greater than east crosses the date line**, for example `170,-20,-170,20`. Invalid API bounds return HTTP 400. The map displays wrapped markers near the current world copy and uses circular longitude averaging for clusters.

**List view** carries the selected city as `city`, or the visible area as `bounds`, plus music and date filters. The list exposes **Remove map area** for a bounds filter. Opening the map from a city/radius search preserves that filter in the programme and return link; the map markers still allow exploration within the site's country scope. Selecting another city starts an exact-city search and clears the radius. Legacy coordinate areas also remain active in the programme and return link. Every active location selection exposes **Show area** on desktop and mobile; clearing it retains dates/music and resumes filtering by the current viewport. Coordinate selections show their fixed radius rather than claiming to represent the viewport.

City URLs use readable `City,CC` values when unambiguous across all English and local names in the full catalogue. Ambiguous marker/search selections use a numeric ID in `city`. Resolving a readable filter to a marker ID never rewrites the filter or narrows its programme results. Old `mapCity`/`cityName` links are normalized with history replacement: the old identity is retained as `city`, and the redundant label is removed. Existing numeric `city` filters remain numeric to preserve their exact semantics. With a city/area selection, map bounds describe only the viewport; otherwise they filter the programme.

## Map loading and configuration

The client-only map loads Leaflet and its CSS lazily. City-radius list controls do not require the map. Map loading or tile errors expose **Retry**, and programme/API errors have separate retry controls. Map controls support keyboard panning and zoom; marker redraws restore keyboard focus to the matching marker or map container. Map movement respects reduced-motion preferences.

The shared `layers/concerts/nuxt.config.ts` exposes these runtime overrides:

| Environment variable | Default |
| --- | --- |
| `NUXT_PUBLIC_AREA_MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| `NUXT_PUBLIC_AREA_MAP_ATTRIBUTION` | Linked OpenStreetMap contributor attribution |

The default tiles require no account. Keep attribution visible and configure both values when changing providers. The tile layer uses `strict-origin-when-cross-origin` and `keepBuffer: 0`; it retains normal browser caching. Follow the provider's [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/) when using the default service.

## Verification

**84 tests, both site typechecks, and both production builds passed**. Built-preview HTTP checks verified city-only and radius results, complete map counts, viewport filtering, invalid inputs, both map routes, and Slovakia scope. The existing cross-site HTTP checks passed as well. Source review corrected date-line marker positioning, medium-width input overflow, and marker keyboard-focus restoration. A subsequent isolated Chrome layout check reproduced and fixed document overflow from absolutely positioned screen-reader link labels. The programme scrollport is positioned to contain those labels. At 1440×900 and 1024×768 the document ends at the viewport bottom; the subsequent viewport layout also confines mobile programme scrolling to its panel, with no document or horizontal scrolling. This verifies map layout and list scrolling, not every interaction listed below. No deployment or database mutation was performed.

Run from the repository root:

```sh
npm test
npm run typecheck
npm run typecheck:sk
npm run build
npm run build:sk
# With a local server and Chrome available:
MAP_SITE_URL=http://127.0.0.1:3000 node agent_utils/check_map_layout.mjs
MAP_SITE_URL=http://127.0.0.1:3000 node agent_utils/check_map_selection.mjs
# With both local development servers running:
GLOBAL_SITE_URL=http://127.0.0.1:3000 SLOVAK_SITE_URL=http://127.0.0.1:3001 npm run test:sites
```

Manual acceptance remains outstanding on both sites:

1. Check city-only, every preset, custom 0 and 500, invalid inputs, city clearing, pagination, and combined date/music filters. Confirm Classical SK retains its Slovakia restriction.
2. Share/reload city-radius and map URLs; check Back/Forward, map-to-list navigation, selected-city versus bounds results, date-line wrapping, cluster counts.
3. Check narrow mobile, medium, and desktop layouts for overflow, readable labels, map/programme usability, visible attribution, keyboard controls and focus restoration, and reduced motion.
4. Check English and Slovak labels, empty results, and failed tile, city-lookup, and programme requests with their recovery actions.
