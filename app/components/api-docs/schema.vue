<template>
  <dl class="docs-fields">
    <div v-for="(field, name) in resolved.properties" :key="name" class="docs-field">
      <dt><code>{{ name }}</code></dt>
      <dd>
        <p v-if="schemaNotes(field)">{{ schemaNotes(field) }}</p>
        <details v-if="children(field).properties">
          <summary>Fields in {{ name }}</summary>
          <ApiDocsSchema :schema="children(field)" />
        </details>
      </dd>
    </div>
  </dl>
</template>
<script setup>
import { resolveSchema, schemaNotes } from '#shared/utils/api-documentation.js'
const props = defineProps({ schema: { type: Object, required: true } })
const resolved = computed(() => resolveSchema(props.schema))
function children(field) {
  const value = resolveSchema(field)
  return value.items ? resolveSchema(value.items) : value
}
</script>

<style scoped>
.docs-field { border-bottom: 1px solid var(--color-gray-200); padding: .75rem 0; }
.docs-field dt { color: var(--color-gray-900); overflow-wrap: anywhere; }
.docs-field dd { font-size: .875rem; }
.docs-field .docs-fields { padding-left: .75rem; border-left: 1px solid var(--color-gray-200); }
.docs-fields .docs-field p { margin: .25rem 0; }
</style>
