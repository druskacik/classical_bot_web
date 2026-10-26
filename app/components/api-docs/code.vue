<template>
  <div class="docs-code">
    <div class="docs-code-toolbar">
      <span>{{ label }}</span>
      <div class="docs-copy-actions">
        <button v-for="action in actions" :key="action.id" type="button" :disabled="status[action.id] === 'Copied!'" :aria-label="`${action.label}: ${label}`" :title="status[action.id] === 'Copy failed' ? 'Select the code to copy it manually.' : undefined" @click="copy(action)">
          <span class="docs-copy-placeholder" aria-hidden="true">{{ action.label }}</span>
          <span role="status" aria-live="polite">{{ status[action.id] || action.label }}</span>
        </button>
      </div>
    </div>
    <pre tabindex="0"><code>{{ displayedCode }}</code></pre>
  </div>
</template>
<script setup>
const props = defineProps({ code: { type: String, default: '' }, url: { type: String, default: '' }, label: { type: String, default: 'example' } })
const displayedCode = computed(() => props.url ? `curl '${props.url}'` : props.code)
const actions = computed(() => props.url
  ? [{ id: 'url', label: 'Copy URL', value: props.url }, { id: 'curl', label: 'Copy curl command', value: displayedCode.value }]
  : [{ id: 'code', label: 'Copy', value: displayedCode.value }])
const status = reactive({})
const timers = new Map()
async function copy(action) {
  clearTimeout(timers.get(action.id))
  try { await navigator.clipboard.writeText(action.value); status[action.id] = 'Copied!' }
  catch { status[action.id] = 'Copy failed' }
  timers.set(action.id, setTimeout(() => { delete status[action.id] }, 3000))
}
onBeforeUnmount(() => timers.forEach(clearTimeout))
</script>

<style scoped>
.docs-code { background: var(--color-gray-50); margin: 1.25rem 0; border: 1px solid var(--color-gray-200); }
.docs-code-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; column-gap: 1rem; padding: .25rem 1rem; font-size: .75rem; border-bottom: 1px solid var(--color-gray-200); }
.docs-copy-actions { display: flex; flex-wrap: wrap; gap: 1rem; }
.docs-copy-placeholder { visibility: hidden; }
.docs-code button > span { grid-area: 1 / 1; }
.docs-code button { display: grid; align-items: center; color: var(--color-primary-700); min-height: 2.75rem; min-width: 2.75rem; cursor: pointer; }
.docs-code button:enabled:hover { text-decoration: underline; }
.docs-code button:disabled { color: var(--color-gray-600); cursor: default; text-decoration: none; }
.docs-code pre { overflow-x: auto; padding: 1rem; font-size: .875rem; line-height: 1.7; color: var(--color-gray-900); }
.docs-code pre code { font-size: inherit; overflow-wrap: normal; }
</style>
