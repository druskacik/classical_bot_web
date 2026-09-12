# Blog surface

Routes: `/blog` and `/blog/[slug]`. Mode: **Read**. Visual authority: `DESIGN.md`, **The Quiet Programme**; product constraints: `PRODUCT.md`. Both routes reuse `EditorialArticle` and the incumbent light editorial typography, whitespace, and blue links.

## Intent and composition

Publish the supplied ODT article with relevant external links and a Paint-like URL → Magic Box → crawler script diagram. The initial collection contains one post, “Scaling classical music concert crawlers with AI agents.”

The index is a single-column list: linked title, date, then description. Fine dividers separate future entries. Content is queried automatically, newest first; an empty collection displays “No posts yet.” Dates use English day/month/year formatting in UTC.

The article keeps its heading hierarchy, paragraphs, numbered lists, external links, and diagram. An “All posts” link beside the publication date returns to the index, with a 44px minimum height and visible keyboard focus. Long text wraps within the reading column. Unknown slugs return a 404.

## Collection maintenance

Add Markdown under `content/blog/` with `title`, `description`, and an ISO `date` in frontmatter. The `blog` collection in `content.config.ts` supplies both routes; the general content collection excludes blog files. Keep posts at the flat slug level supported by `/blog/[slug]`. New posts appear in the index and dynamic sitemap without manually adding entries. The diagram is stored at `public/blog/crawler-factory-magic-box.png` with descriptive alt text and explicit dimensions in the Markdown.

Sources: `app/pages/blog/index.vue`, `app/pages/blog/[slug].vue`, `app/utils/formatBlogDate.ts`, `content.config.ts`, `content/blog/scaling-classical-music-concert-crawlers-with-ai-agents.md`, and `server/plugins/sitemap.js`.

## Review evidence

Reviewer disposition: **ship**, following source review and desktop/mobile screenshots. Reported checks: typecheck and production build passed; no horizontal overflow at 1440px or 390px. Screenshots: `.impeccable/review/blog-index-desktop.png`, `.impeccable/review/blog-index-mobile.png`, `.impeccable/review/blog-post-desktop.png`, and `.impeccable/review/blog-post-mobile.png`.

This surface inherits the existing visual world; it establishes no new global design rules.
