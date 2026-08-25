# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is someone interested in attending classical-music events or in classical music generally. They use ClassicalBot to discover upcoming concerts that match their interests and location or travel plans.

## Product Purpose

ClassicalBot makes upcoming classical-music concerts around the world easy to discover. Success means giving people broad, useful event coverage through a simple interface that helps them find relevant concerts quickly.

## Positioning

ClassicalBot combines unusually broad concert coverage—intended to exceed established directories such as Bachtrack—with simplicity of use. Its value comes from the breadth and quality of its underlying concert data without burdening users with a complex interface.

## Operating Context

People browse all upcoming concerts worldwide or narrow the catalogue by country, city, date, composer, and work. Country pages provide geographically focused discovery. Concert and source information comes from the shared PostgreSQL database maintained by the separate ClassicalBot crawler project.

## Capabilities and Constraints

- The interface is in English.
- Countries use ISO 3166-1 alpha-2 codes.
- The crawler and shared database are the source of truth for concert and source data.
- The product presents upcoming classical-music events worldwide and supports filtering and pagination.
- Product copy must remain concise. Avoid long AI-generated text.

## Brand Commitments

- Preserve the ClassicalBot name and its existing brand assets.
- Keep the interface clean, minimal, light, and editorial in character.
- Favor direct, useful language over promotional or verbose copy.

## Evidence on Hand

- The live database supplies concert, country, composer, work, and source information.
- Existing product content is maintained in `content/about.md` and the application pages and components.
- Existing brand assets are stored under `public/brand/` and in the brand components.
- No testimonials, customer claims, or performance benchmarks are established; future work must not fabricate them.

## Product Principles

1. Coverage is the product advantage: expose the breadth of trustworthy concert data clearly.
2. Make discovery simple: help users move from interest to a relevant concert with minimal friction.
3. Let structured source data lead: do not obscure factual concert information with decorative content.
4. Stay concise: every piece of interface copy should earn its place.
5. Preserve a clean, minimal experience as capabilities grow.

## Accessibility & Inclusion

Concert discovery should remain keyboard-accessible, responsive, and understandable with assistive technology. Do not rely on color alone to communicate state.
