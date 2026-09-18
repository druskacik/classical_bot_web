---
version: 1
slug: "route-map"
primary_target: "route:/map"
related_targets: ["layers/concerts/app/pages/map.vue","layers/concerts/app/components/map-mobile-panel.vue","layers/concerts/app/components/concert-map.client.vue"]
---

# Mobile concert map

## Scope and intent

Explore geography first, then read the concert programme without losing the map position. Preserve the restrained light editorial interface and existing desktop composition. The shared concerts layer serves both sites; labels, counts and dates use the site translation and locale helpers. Markers represent cities, not individual venues.

## Finished composition

Mobile applies at widths up to 768px, plus coarse-pointer screens up to 1024px wide and 500px high. City search and Filters stay above a stable map workspace. The page heading remains accessible but visually hidden; the map's information disclosure explains marker meaning.

The white bottom panel has three states: Explore is an 88px count bar plus the bottom safe-area inset; Preview occupies 45% of the workspace with a 230px minimum; Read fills the workspace. Screens no taller than 500px skip Preview. Selecting or searching for a city reveals Preview, or Read on short screens. The programme scrolls independently. Read exposes List view; selected-city programmes offer Show area. Back to map returns to Explore.

The panel header follows pointer movement after a 5px drag threshold. On release it snaps to the nearest state with a bounded velocity bias; explicit buttons use the same 240ms transform transition. A cancelled gesture returns to the current state, and a new gesture can interrupt a snap. Reduced motion disables snap animation while retaining direct manipulation. The full-height sheet moves via transform; programme height changes only at gesture/state boundaries, never on every pointer move. Keep Leaflet and marker-occlusion measurements out of the drag loop. Filters open a full-screen native modal dialog with date, composer and work controls, Done and contextual Clear filters. Mobile inputs use 16px text; primary touch controls are at least 44px high. Fine borders, inherited serif headings and white surfaces retain the site's existing character.

## Behavior and maintenance

- Panel state is local presentation state. Opening, closing or swiping the panel must not resize or remount Leaflet, change URL filters/bounds, or request new concert data. Keep viewport restoration distinct from deliberate map movement.
- Query state owns city, bounds, music/date filters and pagination. City links reopen the programme on reload; List view carries the current selection and filters. Programme scroll resets when its query or page changes, not when the panel changes state.
- Explore makes the hidden programme inert; Read makes the covered map inert. Covered markers leave the tab order and accessibility tree. Panel controls expose expanded state and restore focus without scrolling; marker redraw preserves focus where possible. Keep visible focus outlines and polite count/status announcements.
- The native filters dialog contains keyboard focus, supports Escape and returns focus to Filters when dismissed. Keep safe-area padding and independent overflow for short screens.
- Measured panel height positions both map-data and tile-loading/error status and their separate Retry controls above Explore and Preview, and excludes covered markers from keyboard access. Read covers the map entirely. Keep map-tile failures distinct from concert-data retry and empty states.
- Desktop retains its toolbar and side-by-side map/programme layout. Mobile color overrides stay scoped: the supplied finish review measured action contrast at 5.25:1 and placeholders at 4.84:1.

The independent finish handoff reported **ship**. Supplied validation covered eight viewport sizes, swipe controls, city selection/reload, filter focus, scroll, URL/map stability and simulated tile failure; the build and both sites' typechecks passed. Screenshots are in `/tmp/map-mobile-review`. This brief records inspected source and the supplied review outcome; global `DESIGN.md` and `.impeccable/design.json` remain outside scope.
