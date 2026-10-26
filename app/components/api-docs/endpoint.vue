<template>
  <section :id="endpoint.id" class="docs-section">
    <h2><a :href="`#${endpoint.id}`">{{ endpoint.title }}</a></h2>
    <p class="docs-route"><span>GET</span> <code>{{ endpoint.path }}</code></p>
    <p>{{ endpoint.description }}</p>
    <ApiDocsCode :url="`https://classicalbot.com${endpoint.path}?${endpoint.query}`" :label="`${endpoint.id} request`" />
    <div class="docs-table-scroll" tabindex="0" :aria-label="`${endpoint.title} parameters`">
      <table>
        <caption>Query parameters</caption>
        <thead><tr><th scope="col">Parameter</th><th scope="col">Description</th></tr></thead>
        <tbody><tr v-for="parameter in endpoint.parameters" :key="parameter.name">
          <th scope="row"><code>{{ parameter.name }}</code><span v-if="parameter.required" class="docs-required">required</span></th>
          <td>{{ parameter.description }} {{ schemaNotes(parameter.schema, false) }}</td>
        </tr></tbody>
      </table>
    </div>
    <details><summary>Response fields</summary><ApiDocsSchema :schema="specification.components.schemas[endpoint.schema]" /></details>
  </section>
</template>
<script setup>
import { specification, schemaNotes } from '#shared/utils/api-documentation.js'
defineProps({ endpoint: { type: Object, required: true } })
</script>

<style scoped>
.docs-route { color: var(--color-gray-900); }
.docs-route span { font-size: .75rem; margin-right: .5rem; font-weight: 600; }
.docs-table-scroll { overflow-x: auto; margin: 1.5rem 0; }
.docs-table-scroll table { width: 100%; border-collapse: collapse; text-align: left; font-size: .875rem; }
.docs-table-scroll caption { text-align: left; color: var(--color-gray-900); margin-bottom: .5rem; }
.docs-table-scroll th, .docs-table-scroll td { vertical-align: top; padding: .75rem .75rem .75rem 0; border-bottom: 1px solid var(--color-gray-200); }
.docs-table-scroll th { font-weight: 400; color: var(--color-gray-900); }
.docs-table-scroll thead th { font-weight: 600; }
.docs-table-scroll tbody th { min-width: 10rem; }
.docs-required { color: var(--color-gray-600); font-size: .75rem; font-weight: 400; }
.docs-table-scroll .docs-required { display: block; }
</style>
