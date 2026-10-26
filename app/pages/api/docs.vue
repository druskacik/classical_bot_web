<template>
  <main class="api-documentation">
    <nav aria-label="Breadcrumb" class="docs-breadcrumb"><NuxtLink to="/api">API</NuxtLink><span aria-hidden="true">/</span><span>Documentation</span></nav>
    <header class="docs-header">
      <h1>API documentation</h1>
      <p>Upcoming global classical concerts data through a simple API.</p>
    </header>
    <div class="docs-layout">
      <aside class="docs-sidebar">
        <nav aria-label="Documentation sections"><p>On this page</p><a v-for="section in sections" :key="section.id" :href="`#${section.id}`" :aria-current="active === section.id ? 'location' : undefined">{{ section.title }}</a></nav>
      </aside>
      <article class="docs-article">
        <details class="docs-mobile-index"><summary>On this page</summary><nav aria-label="Documentation sections"><a v-for="section in sections" :key="section.id" :href="`#${section.id}`">{{ section.title }}</a></nav></details>
        <section id="quickstart" class="docs-section">
          <h2><a href="#quickstart">Quickstart</a></h2>
          <p>The API is public: no account or API key is required. Requests use <code>https://classicalbot.com/api/v1</code> and return JSON.</p>
          <ApiDocsCode url="https://classicalbot.com/api/v1/concerts?country_code=CZ&page_size=2" label="quickstart request" />
          <p>Filter by country to get started, or look up a city, performer or venue below to find its ID.</p>
          <details><summary>Example JSON response <span class="docs-muted">· shortened example</span></summary><ApiDocsCode :code="example" label="JSON response" /></details>
        </section>
        <ApiDocsEndpoint v-for="endpoint in endpoints" :key="endpoint.id" :endpoint="endpoint" />
        <section id="response-reference" class="docs-section">
          <h2><a href="#response-reference">Concert response reference</a></h2>
          <p>Missing values are <code>null</code> or empty arrays. IDs and prices are strings.</p>
          <ApiDocsSchema :schema="specification.components.schemas.Concert" />
        </section>
        <section id="pagination" class="docs-section">
          <h2><a href="#pagination">Pagination</a></h2>
          <p>Use <code>page</code> and <code>page_size</code>, or follow <code>pagination.next</code>. Prefix next links with <code>https://classicalbot.com</code>.</p>
          <p>Concert pages default to 50 results; city, performer and venue searches default to 20. Both allow up to 100. No matches returns an empty list.</p>
          <p>Use <code>all=true</code> to get all results without <code>page</code> or <code>page_size</code>. Responses are limited to 10,000 concerts and 20 MiB. Use pagination for larger results.</p>
        </section>
        <section id="limits" class="docs-section">
          <h2><a href="#limits">Limits</a></h2>
          <p>The API allows 60 requests per minute per IP, including up to five requests with <code>all=true</code>. On HTTP 429, wait the number of seconds in <code>Retry-After</code> before retrying.</p>
          <p>Results are cached for up to two minutes. <code>generated_at</code> shows when the response data was loaded.</p>
        </section>
        <section id="data-behaviour" class="docs-section">
          <h2><a href="#data-behaviour">Understanding the data</a></h2>
          <h3>Dates, times and availability</h3>
          <p>Results include concerts from today onward, using the UTC date. Concert dates use <code>YYYY-MM-DD</code> and times use local <code>HH:mm:ss</code>. Other timestamps are in UTC.</p>
          <p>Check <code>event_status</code> for cancellations or schedule changes. Missing prices do not mean free admission.</p>
          <h3>IDs and search</h3>
          <p>Use the IDs returned by the city, performer and venue searches. Keep them as strings.</p>
          <p>Search matches part of a name, ignoring case and accents. Add <code>has_upcoming=true</code> to find only results with upcoming concerts.</p>
          <h3>Sources</h3>
          <p>Use <code>url</code> to get concerts from a source website.</p>
          <p>When registration is enabled, requesting a new source URL queues it for processing. Otherwise, an unknown source returns HTTP 404.</p>
          <p>HTTP 202 means the source is still being processed. Wait 60 seconds before checking again.</p>
          <p class="docs-contact">Need help with an integration? <NuxtLink to="/contact">Contact us</NuxtLink>.</p>
        </section>
      </article>
    </div>
  </main>
</template>
<script setup>
// Public docs intentionally describe JSON only. Do not mention CSV or add CSV examples,
// format parameters or download instructions, including in the linked OpenAPI specification.
// CSV remains supported by the API; this is a documentation decision, not an API change.
import { endpoints, specification } from '#shared/utils/api-documentation.js'
import { classicalBotSite } from '../../../site.config.js'
const sections = [{ id: 'quickstart', title: 'Quickstart' }, ...endpoints.map(({ id, title }) => ({ id, title })), { id: 'response-reference', title: 'Response reference' }, { id: 'pagination', title: 'Pagination' }, { id: 'limits', title: 'Limits' }, { id: 'data-behaviour', title: 'Understanding the data' }]
const active = ref('quickstart')
let observer
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) active.value = entry.target.id
  }, { rootMargin: '-10% 0px -65% 0px' })
  document.querySelectorAll('.docs-section').forEach(section => observer.observe(section))
})
onBeforeUnmount(() => observer?.disconnect())
const example = JSON.stringify({ source: null, concerts: [{ id: '123', title: 'Illustrative concert', date: '2027-06-12', time: '19:30:00', city: 'Prague', country_code: 'CZ', venue_name: null, buy_url: null }], pagination: { page: 1, page_size: 2, total: 1, total_pages: 1, all: false, next: null }, generated_at: '2027-06-01T12:00:00Z' }, null, 2)
useSeoMeta({ title: 'API documentation — ClassicalBot', description: 'Query upcoming classical concerts and discover cities, performers and venues.' })
useHead({ link: [{ rel: 'canonical', href: `${classicalBotSite.origin}/api/docs` }] })
</script>

<style scoped>
.api-documentation { max-width: 72rem; margin: 0 auto; padding: 2rem 1rem 4rem; width: 100%; color: var(--color-gray-700); line-height: 1.75; }
.api-documentation :deep(a) { color: var(--color-primary-700); text-underline-offset: .25em; }
.api-documentation :deep(a:hover) { text-decoration: underline; }
.api-documentation :deep(:focus-visible) { outline: 2px solid var(--color-primary-700); outline-offset: 4px; }
.api-documentation :deep(::selection) { background: var(--color-primary-100); color: var(--color-gray-900); }
.docs-breadcrumb { display: flex; gap: .75rem; font-size: .875rem; }
.docs-header { padding: 2rem 0 2.5rem; border-bottom: 1px solid var(--color-gray-200); }
.docs-header h1 { font-family: var(--font-serif); color: var(--color-gray-900); font-size: clamp(2rem, 4vw, 3rem); font-weight: 400; line-height: 1.2; }
.docs-header p { margin: 1rem 0; font-size: 1.125rem; }
.docs-header > a { font-size: .875rem; }
.docs-layout { display: grid; gap: 2rem; padding-top: 2rem; }
.docs-sidebar { display: none; }
.docs-article { min-width: 0; max-width: 48rem; }
.docs-mobile-index { margin-bottom: 2rem; }
.docs-mobile-index nav { display: grid; padding-top: .75rem; }
.docs-mobile-index a { padding: .25rem 0; }
.docs-section { scroll-margin-top: 6rem; margin-bottom: 3.5rem; }
.docs-section + .docs-section { padding-top: 2rem; border-top: 1px solid var(--color-gray-200); }
.docs-section :deep(h2) { font-family: var(--font-serif); font-size: 1.75rem; font-weight: 400; line-height: 1.3; margin-bottom: 1rem; color: var(--color-gray-900); }
.docs-section :deep(h2 a) { color: inherit; }
.docs-section :deep(h3) { font-size: 1.125rem; color: var(--color-gray-900); margin: 1.75rem 0 .5rem; }
.docs-section :deep(p) { margin: .75rem 0; }
.api-documentation :deep(code) { font-size: .875em; overflow-wrap: anywhere; }
.docs-muted { color: var(--color-gray-600); font-size: .75rem; font-weight: 400; }
.api-documentation :deep(summary) { cursor: pointer; padding: .65rem 0; color: var(--color-primary-700); }
.docs-contact { padding-top: 1.5rem; }
@media (min-width: 640px) { .api-documentation { padding-left: 1.5rem; padding-right: 1.5rem; } }
@media (min-width: 1024px) {
 .docs-layout { grid-template-columns: 12rem minmax(0, 48rem); gap: 3rem; }
 .docs-sidebar { display: block; }
 .docs-sidebar nav { position: sticky; top: 6rem; font-size: .875rem; }
 .docs-sidebar nav p { color: var(--color-gray-900); margin-bottom: .75rem; }
 .docs-sidebar a { display: block; padding: .35rem 0; color: var(--color-gray-600); }
 .docs-sidebar a[aria-current] { color: var(--color-primary-700); text-decoration: underline; }
 .docs-mobile-index { display: none; }
}
</style>
