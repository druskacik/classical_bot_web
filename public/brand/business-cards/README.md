# ClassicalBot business cards

Three single-sided project cards, following the website’s Playfair Display / Lato typography, existing mark, slate ink, white background, fine rules, and blue URL.

- `01-editorial.svg` — left-aligned wordmark and a quiet programme-style layout.
- `02-centered.svg` — centered mark, wordmark, description, and URL.
- `03-split.svg` — compact brand header, larger description, and a directional URL footer.
- `overview.svg` — comparison sheet; for review, not print production.

Each card is **85 × 55 mm**. All lettering is converted to vector paths: no font installation, linked assets, or raster images are required. The website address is `classicalbot.com`. No personal contact details are assumed.

## Bolder fronts and interchangeable backs

These additional fronts explore composition, scale, and color rather than heavier font weights:

- `04-monument.svg` — a monumental stacked wordmark with the mark as its counterweight.
- `05-nocturne.svg` — deep slate with an oversized white mark and generous negative space.
- `06-programme-blue.svg` — a full Programme Blue field with the line “The world. In concert.”

Three backs can be paired with any front, including the original three:

- `back-01-contact.svg` — just the brand mark, `info@classicalbot.com`, and website. Best for a quiet, contact-focused card.
- `back-02-discover.svg` — “Find your next concert.”, a vector QR code linking directly to `https://classicalbot.com`, the readable website address, and `info@classicalbot.com`. Recommended for handing out to concertgoers.
- `back-03-conversation.svg` — “Let’s talk classical.”, `info@classicalbot.com`, website, and mark. Best for introductions and networking.

`overview-bold-and-backs.svg` shows all six new designs. Its rows suggest pairings; all backs are interchangeable. A strong default pairing is **Nocturne + Discover / QR**. No phone number, social handle, or personal title has been invented.

## Printing

Use the corresponding `-bleed.svg` if your printer requires bleed. Its canvas is **91 × 61 mm**, providing **3 mm bleed** on every side. Trim to the centered **85 × 55 mm** rectangle; the trim origin in SVG coordinates is `(0, 0)`, with 10 units per millimetre. Keep scale at 100%. Essential artwork is at least 5 mm inside the trim edge. The background color extends through the bleed; crop marks are intentionally omitted.

SVG colors are RGB. If the printer requires CMYK or PDF/X, import the bleed SVG into a vector layout application, set the stated trim and bleed, and export using the printer’s supplied color profile and PDF specification. These SVGs do not embed a press profile or PDF trim metadata.

## Editing / regenerating

The readable copy and layout live in `scripts/generate-business-cards.swift` at the repository root. Run from that root on macOS:

```sh
swift -module-cache-path /tmp/classicalbot-swift-cache scripts/generate-business-cards.swift /path/to/PlayfairDisplay.ttf /path/to/Lato-Regular.ttf
```

Use the regular Lato font and the Playfair Display variable font (default regular weight), available from the Google Fonts repository under the SIL Open Font License. Font files are used only while generating outlines and are not required to view or print the cards.
