---
name: ClassicalBot
description: A quiet editorial guide to classical-music concerts worldwide.
colors:
  programme-blue: "oklch(54.6% 0.245 262.881)"
  programme-blue-deep: "oklch(48.8% 0.243 264.376)"
  gallery-white: "#ffffff"
  gallery-mist: "oklch(98.5% 0.002 247.839)"
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
  label:
    fontFamily: "Lato, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.12em"
rounded:
  focus: "0.125rem"
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
    typography: "{typography.body}"
    rounded: "{rounded.focus}"
    padding: "0"
  field-underline:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "0.375rem 0"
    height: "2.75rem"
  filter-chip:
    textColor: "{colors.programme-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.625rem"
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

The system is refined and restrained rather than ornamental. Gallery-white space, slate typography, fine rules, and measured blue interaction cues let programme data provide the visual interest. Colorful source and location badges are purposeful indexing signals, not decoration.

**Key Characteristics:**

- Light, editorial surfaces with generous whitespace.
- Serif hierarchy paired with compact, practical controls.
- Fine dividers and underlines instead of enclosing cards.
- Programme Blue reserved for links, focus, and active interaction.
- Colorful badges used to scan structured concert metadata.

## Colors

Programme Blue sits against Gallery White and a cool Slate hierarchy; the palette is quiet until interaction or metadata requires distinction.

### Primary

- **Programme Blue:** The singular interaction accent for links, focused field edges, loading progress, and selected filter details.
- **Deep Programme Blue:** The stronger hover state for editorial links.

### Neutral

- **Gallery White:** The page, navigation, list, and overlay surface.
- **Gallery Mist:** The restrained hover fill for rows and listbox options.
- **Slate Divider:** Fine borders, section rules, and list separators.
- **Slate Field:** The resting underline for form controls.
- **Muted Slate:** Labels, composer links, quiet metadata, and placeholders.
- **Secondary Slate:** Supporting copy and result summaries.
- **Body Slate:** Long-form reading copy.
- **Ink Slate:** Primary text and concert titles.
- **Deep Slate:** Highest-emphasis headings.

### Named Rules

**The Programme Blue Rule.** Programme Blue communicates navigation, focus, or active state; it does not become a decorative surface wash.

**The Gallery Rule.** Default surfaces remain white, with Gallery Mist appearing only as a subtle response to interaction.

## Typography

**Display Font:** Playfair Display (with serif fallback)  
**Body Font:** Lato (with sans-serif fallback)

**Character:** Playfair Display supplies the cultural and editorial register without ornament. Lato keeps filters, metadata, and long-form text compact, neutral, and highly legible.

### Hierarchy

- **Display** (regular, 2.25rem, 2.5rem line-height): responsive primary headings on concert discovery pages.
- **Headline** (regular, 1.875rem, 2.25rem line-height): page titles on compact viewports and secondary public pages.
- **Title** (regular, 1.5rem, 2rem line-height): month groups, source sections, and article subheadings.
- **Body** (regular, 1rem, 1.5 line-height): general prose; long-form editorial copy expands to 1.75 line-height and stays within a readable measure.
- **Label** (semibold, 0.75rem, 0.12em tracking, uppercase): filter labels and compact control context.

### Named Rules

**The Programme Hierarchy Rule.** Serif type names pages and sections; sans-serif type performs actions, carries metadata, and supports sustained reading.

**The Quiet Weight Rule.** Hierarchy comes from family, scale, and space before boldness; serif headings remain regular weight.

## Layout

Pages use a centered responsive container with 1rem outer padding, expanding to 1.5rem and 2rem at wider breakpoints. Primary concert content is capped at 72rem, while reading surfaces narrow to approximately 48rem and introductory copy to approximately 42rem.

The spacing rhythm is based on 0.25rem increments, with 1rem row padding, 1.5rem grid gaps, 2rem page padding, and 2.5rem separation for major result groups. Filters progress from one column to two and then four columns; concert rows shift from stacked metadata to a fixed date column beside flexible programme content at the large breakpoint.

**The Open Margin Rule.** Create hierarchy with whitespace and alignment before adding a container, background, or border.

## Elevation & Depth

The system is flat by default. Hierarchy comes from whitespace, fine dividers, typography, and transient tonal hover states. Large shadows are reserved for temporary overlays such as autocomplete menus, where separation from the underlying page is functionally necessary.

### Shadow Vocabulary

- **Overlay lift** (`0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): autocomplete menus and recoverable overlay error states only.

### Named Rules

**The Flat-by-Default Rule.** Resting page content has no shadow; elevation marks a temporary layer, never ordinary grouping.

## Shapes

The form language is predominantly square and rule-based. Lists, dropdowns, and fields use straight edges; focus targets may receive a tiny 0.125rem corner to prevent harsh outline clipping. Metadata badges use a restrained 0.375rem curve, while selected-filter chips use a full pill only because they behave as removable tokens.

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
- **Metadata badges:** Compact medium-weight labels with deterministic categorical colors; location badges are outlined and source badges are solid.
- **State:** Focus remains explicit on the interactive parent, and coarse-pointer remove targets expand without visually enlarging the pill.

### Concert Rows

- **Corner Style:** Square.
- **Background:** Gallery White with Gallery Mist on hover.
- **Shadow Strategy:** None.
- **Border:** A fine Slate Divider enclosure with matching row separators.
- **Internal Padding:** 1rem vertically and 1.5rem horizontally.
- **Behavior:** Date and time form the stable scan column; title, badges, and composers wrap naturally without turning each concert into a card.

### Navigation

- **Style:** A white 4rem bar with the serif wordmark, monochrome line mark, and quiet link navigation.
- **Hover / Focus:** Text darkens subtly on hover; keyboard focus uses a clear outline.
- **Mobile:** Navigation becomes a full-viewport white dialog with a fine divider and explicit close control.

### Autocomplete Overlay

- **Style:** A square Gallery White listbox with a fine border, compact rows, and the system's only standard overlay shadow.
- **State:** Gallery Mist indicates keyboard or pointer focus; secondary labels and result counts remain in quieter Slate roles.

## Do's and Don'ts

### Do:

- **Do** let programme data and typography create the hierarchy.
- **Do** preserve Gallery White space and fine Slate rules between dense information.
- **Do** reserve Programme Blue for navigation, focus, and active interaction.
- **Do** keep controls at least 2.75rem tall and preserve explicit keyboard focus.
- **Do** keep interface copy short, factual, and useful.

### Don't:

- **Don't** introduce ornamental redesigns or decorative classical-music motifs.
- **Don't** convert concert rows and page sections into a card-heavy layout.
- **Don't** build dense dashboard chrome around the discovery experience.
- **Don't** use shadows on resting content or ordinary grouping surfaces.
- **Don't** replace useful structured data with long promotional or AI-generated prose.
