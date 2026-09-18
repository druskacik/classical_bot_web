<template>
  <div ref="panel" class="map-panel" :class="mobile && `is-mobile is-${modelValue}`">
    <header v-if="mobile" class="panel-header" @pointerdown="startDrag" @pointerup="endDrag" @pointercancel="dragY = null">
      <span class="panel-handle" aria-hidden="true" />
      <div class="panel-heading">
        <button ref="toggle" type="button" class="panel-toggle" :aria-expanded="modelValue !== 'explore'" aria-controls="map-programme" @click="expand">
          <span><span class="block font-serif text-xl">{{ title }}</span><span class="block text-xs text-gray-600" aria-live="polite">{{ summary }}</span></span>
          <UIcon :name="modelValue === 'read' ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="size-5 shrink-0" />
          <span class="sr-only">{{ modelValue === 'read' ? t('Back to map') : t('Show concerts') }}</span>
        </button>
        <button v-if="modelValue !== 'explore'" type="button" class="panel-back" @click="change('explore')">{{ t('Back to map') }}</button>
      </div>
      <div v-if="modelValue === 'read' || (modelValue === 'preview' && selected)" class="flex items-center justify-between gap-3 text-sm text-primary">
        <button v-if="selected" type="button" class="min-h-11" @click="$emit('clear')">{{ t('Show area') }}</button>
        <NuxtLink v-if="modelValue === 'read'" :to="listLocation" class="ml-auto inline-flex min-h-11 items-center">{{ t('List view') }}</NuxtLink>
      </div>
    </header>
    <slot />
  </div>
</template>
<script setup>
const props = defineProps({ mobile: Boolean, short: Boolean, modelValue: { type: String, default: 'explore' }, title: String, summary: String, selected: Boolean, listLocation: Object })
const emit = defineEmits(['update:modelValue', 'clear', 'occlusion'])
const { t } = useConcertText()
const toggle = ref(null)
const panel = ref(null)
let observer
onMounted(() => {
  observer = new ResizeObserver(() => emit('occlusion', props.mobile ? panel.value.getBoundingClientRect().height : 0))
  observer.observe(panel.value)
})
onBeforeUnmount(() => observer?.disconnect())
let dragY = null
let dragged = false
const change = value => { emit('update:modelValue', value); toggle.value?.focus({ preventScroll: true }) }
const expand = () => {
  if (dragged) { dragged = false; return }
  change(props.modelValue === 'read' ? 'explore' : props.modelValue === 'preview' || props.short ? 'read' : 'preview')
}
const startDrag = event => {
  if (event.target.closest('a, button:not(.panel-toggle)')) return
  dragY = event.clientY
  dragged = false
  const target = event.target.closest('button') || event.currentTarget
  target.setPointerCapture(event.pointerId)
}
const endDrag = event => {
  if (dragY === null) return
  const delta = event.clientY - dragY
  dragY = null
  if (Math.abs(delta) < 35) return
  dragged = true
  change(delta < 0 ? (props.modelValue === 'explore' && !props.short ? 'preview' : 'read') : (props.modelValue === 'read' && !props.short ? 'preview' : 'explore'))
}
</script>
<style scoped>
.map-panel { display: contents; }
.is-mobile { position: absolute; z-index: 700; inset-inline: 0; bottom: 0; display: flex; flex-direction: column; min-height: 0; height: calc(88px + env(safe-area-inset-bottom)); background: white; border-top: 1px solid var(--color-gray-300); padding-bottom: env(safe-area-inset-bottom); }
.is-preview { height: max(45%, 230px); max-height: 100%; }
.is-read { height: 100%; }
.panel-header { flex: none; padding: 0 1rem; touch-action: none; }
.panel-handle { display: block; width: 2rem; height: 3px; background: var(--color-gray-300); margin: 8px auto 0; border-radius: 2px; }
.panel-heading { display: flex; gap: .75rem; align-items: center; }
.panel-toggle { display: flex; flex: 1; min-width: 0; min-height: 68px; gap: .75rem; align-items: center; justify-content: space-between; text-align: left; cursor: pointer; }
.panel-toggle > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.panel-back { min-height: 44px; font-size: var(--text-xs); color: var(--ui-primary); cursor: pointer; }
.is-explore .panel-toggle > span:first-child > span:first-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.is-mobile :deep(.map-programme) { flex: 1; border-top: 1px solid var(--color-gray-200); opacity: 1; transition: opacity 160ms ease-out; }
.is-explore :deep(.map-programme) { visibility: hidden; opacity: 0; }
@media (prefers-reduced-motion: reduce) { .is-mobile :deep(.map-programme) { transition: none; } }
</style>
