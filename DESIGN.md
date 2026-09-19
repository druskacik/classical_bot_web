---
name: ClassicalBot
description: A quiet editorial guide to classical-music concerts worldwide.
colors:
  programme-blue: "oklch(62.3% 0.214 259.815)"
  programme-blue-strong: "oklch(54.6% 0.245 262.881)"
  programme-blue-deep: "oklch(48.8% 0.243 264.376)"
  gallery-white: "#ffffff"
  gallery-mist: "oklch(98.5% 0.002 247.839)"
  slate-soft: "oklch(96.7% 0.003 264.542)"
  slate-faint: "oklch(70.7% 0.022 261.325)"
  slate-divider: "oklch(92.8% 0.006 264.531)"
  slate-field: "oklch(87.2% 0.01 258.338)"
  slate-muted: "oklch(55.1% 0.027 264.364)"
  slate-secondary: "oklch(44.6% 0.03 256.802)"
  slate-body: "oklch(37.3% 0.034 259.733)"
  slate-ink: "oklch(21% 0.034 264.665)"
  slate-deep: "oklch(13% 0.028 261.692)"
typography:
  display:
    fontFamily: "Playfair Display, serif"
    fontSize: "2.25rem"
    fontWeight: 400
    lineHeight: "2.5rem"
    letterSpacing: "normal"
  headline:
    fontFamily: "Playfair Display, serif"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: "2.25rem"
    letterSpacing: "normal"
  title:
    fontFamily: "Playfair Display, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: "2rem"
    letterSpacing: "normal"
  body:
    fontFamily: "Lato, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  compact:
    fontFamily: "Lato, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "normal"
  chip:
    fontFamily: "Lato, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
    letterSpacing: "normal"
  label:
    fontFamily: "Lato, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.12em"
rounded:
  focus: "0.25rem"
  badge: "0.375rem"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  section: "2.5rem"
components:
  text-action:
    textColor: "{colors.programme-blue}"
    typography: "{typography.compact}"
    rounded: "{rounded.focus}"
    padding: "0"
  field-underline:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink}"
    typography: "{typography.compact}"
    rounded: "0"
    padding: "0.375rem 0"
    height: "2.75rem"
  filter-chip:
    textColor: "{colors.programme-blue}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.125rem 0.125rem 0.625rem"
  concert-row:
    backgroundColor: "{colors.gallery-white}"
    textColor: "{colors.slate-ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "1rem 1.5rem"
---

# Design System: ClassicalBot

## Overview

**Creative North Star: "The Quiet Programme"**

ClassicalBot behaves like a carefully typeset concert programme that happens to contain a worldwide catalogue. The interface is calm, cultured, and direct: expressive serif headings establish an editorial voice while compact sans-serif controls and structured rows keep discovery fast.

The system is refined and restrained rather than ornamental. Gallery-white space, slate typography, fine rules, and measured blue interaction cues let programme data provide the visual interest. Colorful location badges and neutral source badges are purposeful indexing signals, not decoration.

**Key Characteristics:**

- Light, editorial surfaces with generous whitespace.
- Serif hierarchy paired with compact, practical controls.
- Fine dividers and underlines instead of enclosing cards.
- Programme Blue reserved for links, focus, and active interaction.
- Colorful location badges and quiet source labels used to scan structured concert metadata.

## Colors

Programme Blue sits against Gallery White and a cool Slate hierarchy; the palette is quiet until interaction or metadata requires distinction.

### Primary

- **Programme Blue:** The singular interaction accent for links, focused field edges, loading progress, and selected filter details.
- **Strong Programme Blue:** Explicit accent for composer actions, mobile map actions, and editorial rules.
- **Deep Programme Blue:** The stronger hover state for editorial links.

The default interaction accent follows Nuxt UI’s light-mode primary color. Composer surfaces and concert-list pages override it with Strong Programme Blue. The historical Slate names below describe the application’s gray utilities; Nuxt UI’s own neutral palette is configured separately as slate.

### Neutral

- **Gallery White:** The page, navigation, list, and overlay surface.
- **Gallery Mist:** The restrained hover fill for rows and listbox options.
- **Soft Slate:** Neutral source-badge fill and subdued loading surfaces.
- **Faint Slate:** Placeholders and autocomplete result counts.
- **Slate Divider:** Fine borders, section rules, and list separators.
- **Slate Field:** The resting underline for form controls.
- **Muted Slate:** Labels and quiet metadata.
- **Secondary Slate:** Supporting copy, composer links, and result summaries.
- **Body Slate:** Long-form reading copy.
- **Ink Slate:** Primary text and concert titles.
- **Deep Slate:** Highest-emphasis headings.

### Named Rules

**The Programme Blue Rule.** Programme Blue communicates navigation, focus, or active state; it does not become a decorative surface wash.

**The Gallery Rule.** Default surfaces remain white, with Gallery Mist used for subtle interaction feedback.

## Typography

**Display Font:** Playfair Display (with serif fallback)  
**Body Font:** Lato (with sans-serif fallback)

**Character:** Playfair Display supplies the cultural and editorial register without ornament. Lato keeps filters, metadata, and long-form text compact, neutral, and highly legible.

### Hierarchy

- **Display** (regular, 2.25rem, 2.5rem line-height): responsive primary headings on concert discovery pages.
- **Headline** (regular, 1.875rem, 2.25rem line-height): page titles on compact viewports and secondary public pages.
- **Title** (regular, 1.5rem, 2rem line-height): month groups, source sections, and article subheadings.
- **Body** (regular, 1rem, 1.5 line-height): general prose; long-form editorial copy expands to 1.75 line-height and stays within a readable measure.
- **Compact** (regular, 0.875rem, 1.25rem line-height): controls and metadata.
- **Chip** (regular, 0.75rem, 1rem line-height): removable selections, without uppercase tracking.
- **Label** (semibold, 0.75rem, 0.12em tracking, uppercase): filter labels and compact control context.

Composer index headings grow from 2.25rem to 3rem; composer detail headings reach 3.75rem on large screens. These are surface-specific extensions of the serif hierarchy.

### Named Rules

**The Programme Hierarchy Rule.** Serif type names pages and sections; sans-serif type performs actions, carries metadata, and supports sustained reading.

**The Quiet Weight Rule.** Hierarchy comes from family, scale, and space before boldness; serif headings remain regular weight.

## Layout

Pages use a centered responsive container with 1rem outer padding, expanding to 1.5rem and 2rem at wider breakpoints. Primary concert content is capped at 72rem, while reading surfaces narrow to approximately 48rem and introductory copy to approximately 42rem.

The spacing rhythm is based on 0.25rem increments, with 1rem row padding and 1.5rem primary filter gaps. Discovery pages use 1.25rem vertical padding on small screens and 2rem from 640px; month groups start 1rem apart, increasing to 1.5rem. Primary filters stack on mobile and form three columns from 768px, or two when country is fixed. Composer and work filters form a separate two-column row from 768px; on mobile, they sit behind the “Composer or work” disclosure, expanded when either has a selection, without a separator above them. Concert rows use a 5rem date column, narrowing to 2.75rem below 640px.

Composer galleries use one, two, and three columns at the base, 640px, and 1024px sizes, with 2rem horizontal gaps and 2.5–3rem vertical gaps. The map is a dedicated viewport workspace capped at 120rem, with a side programme on desktop and a movable bottom panel on mobile; its detailed behavior belongs to the map surface brief.

**The Open Margin Rule.** Create hierarchy with whitespace and alignment before adding a container, background, or border.

## Elevation & Depth

The system is flat by default. Hierarchy comes from whitespace, fine dividers, typography, and transient tonal hover states. Large shadows are reserved for temporary overlays such as autocomplete menus, where separation from the underlying page is functionally necessary.

### Shadow Vocabulary

- **Overlay lift** (`0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): autocomplete menus and recoverable overlay error states only.

### Named Rules

**The Flat-by-Default Rule.** Resting page content has no shadow; elevation marks a temporary layer, never ordinary grouping.

## Shapes

The form language is predominantly square and rule-based. Lists, dropdowns, and fields use straight edges; focus targets may receive a tiny 0.25rem corner to prevent harsh outline clipping. Composer links use a 2px focus corner in their surface stylesheet. Metadata badges use a restrained 0.375rem curve, while selected-filter chips use a full pill only because they behave as removable tokens.

**The Earned Curve Rule.** Rounded shapes identify compact metadata or removable selections; structural surfaces remain square.

## Components

### Text Actions

- **Shape:** Visually unboxed, with a tiny focus-only corner.
- **Default:** Programme Blue text on the surrounding white surface.
- **Hover / Focus:** Underline on hover; a two-pixel Programme Blue outline with a two-pixel offset on keyboard focus.

### Inputs / Fields

- **Style:** Transparent fields with a single Slate Field underline, compact sans-serif text, and a 2.75rem minimum control height.
- **Focus:** The underline shifts to Programme Blue and gains a restrained translucent focus ring.
- **Labels:** Small semibold uppercase labels with generous tracking sit above fields.
- **Error / Disabled:** Errors use concise nearby copy; unavailable native selections explain their state in the option text.

### Chips and Badges

- **Filter chips:** Pale Programme Blue pills with blue text and a circular remove target.
- **Metadata badges:** Compact medium-weight labels; location badges use deterministic categorical outlines; source badges use a neutral Soft Slate fill and Body Slate text.
- **State:** Focus remains explicit on the interactive parent, and coarse-pointer remove targets expand from 1.75rem to 2.75rem, allowing the pill and field to grow.

### Concert Rows

- **Corner Style:** Square.
- **Background:** Gallery White, including on hover.
- **Shadow Strategy:** None.
- **Border:** Fine Slate Divider row separators without an enclosure.
- **Internal Padding:** 1.5rem vertically below 640px and 1.75rem above; no horizontal padding.
- **Behavior:** Date and time form the stable scan column; the regular serif title sits on its own line, followed by colored location badges, quiet source text, and programme data. Programme groups stack on mobile and use an 11rem composer column from 640px. Composer names are semibold on mobile and regular from 640px; work links wrap naturally. Coarse-pointer programme links have 2.75rem minimum targets.

### Shared Concert Discovery

All homepage, country, and city discovery routes use the same shared presentation, including Classical SK. There is no presentation opt-in prop. The shared surface contract is recorded in [.impeccable/surfaces/route-home.md](.impeccable/surfaces/route-home.md).

- **Ground and structure:** The discovery filters retain their original transparent, unboxed surface without an extra heading. Concert rows stay Gallery White without an enclosure or hover fill. Strong Programme Blue marks interaction. City and country retain their colored outline badges; hovering a linked badge adds a light tint in its own color without underlining, while keyboard focus retains its outline. Sources use quiet text.
- **Hierarchy:** Centered regular serif page heading (2.25rem, 1.2 line-height; 1.875rem below 640px), regular serif concert titles (1.5rem, 1.35 line-height), and tabular sans-serif day numbers (2.25rem, 1.15 line-height). The date column leads into title, metadata, and a ruled programme with composer names semibold below 640px and regular from 640px, alongside linked works.
- **Responsive layout:** Content stays within 72rem inside an 80rem outer container. The date column is 5rem with a 1.5rem gap, narrowing below 640px to 2.75rem with a 1rem gap. Below 768px all five filter fields stack; Composer and Work remain visible. Below 640px programme pairs and location/source metadata stack naturally.
- **Interaction:** Focused concert-list autocomplete and date/country fields use a single two-pixel blue underline without a surrounding ring. Square pagination targets are 2.75rem (44px), with Lucide arrows and accessible button names. Keyboard focus uses a two-pixel blue outline with a three-pixel offset. Reduced motion removes concert-list transitions and makes pagination scrolling immediate; ordinary pagination uses smooth scrolling and returns focus to the results summary.

### Navigation

- **Style:** A white 4rem bar with the serif wordmark, monochrome line mark, and quiet link navigation.
- **Hover / Focus:** Text darkens subtly on hover; keyboard focus uses a clear outline.
- **Mobile:** Navigation becomes a full-viewport white dialog with a fine divider and explicit close control.

### Autocomplete Overlay

- **Style:** A square Gallery White listbox with a fine border, compact rows, and the standard overlay shadow.
- **State:** Gallery Mist indicates keyboard or pointer focus; secondary labels and result counts remain in quieter Slate roles.

### Composer Gallery and Listening

- **Style:** Square cover artwork without card enclosures, serif names, and compact concert counts. Missing covers use a pale square with the composer’s name.
- **Interaction:** Cover links dim artwork slightly over 180ms on hover and retain an explicit focus outline. Reduced-motion preferences remove the cover transition.
- **Listening:** The embedded player loads after a direct text action; supporting content remains flat with fine rules.

### Pagination and Updating

- **Style:** Square 2.75rem page buttons with transparent resting borders, an Ink Slate active border, and quieter disabled states.
- **Interaction:** Border and text changes take 150ms; refreshing results fade to 55% opacity over 200ms while keeping their layout.
- **Map motion:** The mobile panel uses a 240ms transform transition and 160ms programme fade; both are disabled for reduced-motion preferences.

## Do's and Don'ts

### Do:

- **Do** let programme data and typography create the hierarchy.
- **Do** preserve Gallery White space and fine Slate rules between dense information.
- **Do** reserve Programme Blue for navigation, focus, and active interaction.
- **Do** keep filter fields and coarse-pointer programme targets at least 2.75rem tall and preserve explicit keyboard focus; concert-list pagination uses 2.75rem targets.
- **Do** keep interface copy short, factual, and useful.

### Don't:

- **Don't** introduce ornamental redesigns or decorative classical-music motifs.
- **Don't** convert concert rows and page sections into a card-heavy layout.
- **Don't** build dense dashboard chrome around the discovery experience.
- **Don't** use shadows on resting content or ordinary grouping surfaces.
- **Don't** replace useful structured data with long promotional or AI-generated prose.
