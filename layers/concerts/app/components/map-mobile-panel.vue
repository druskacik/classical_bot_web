<template>
  <div ref="sheet" class="map-sheet" :class="{ 'is-mobile': mobile, 'can-animate': motionReady && !holding, 'is-moving': dragging || settling }" :style="sheetStyle" @transitionend="transitionEnded">
  <div ref="panel" class="map-panel" :class="[mobile && `is-mobile is-${modelValue}`, dragging && 'is-dragging']">
    <header v-if="mobile" class="panel-header" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag">
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
  </div>
</template>
<script setup>
const props = defineProps({ mobile: Boolean, short: Boolean, modelValue: { type: String, default: 'explore' }, title: String, summary: String, selected: Boolean, listLocation: Object })
const emit = defineEmits(['update:modelValue', 'clear', 'occlusion'])
const { t } = useConcertText()
const toggle = ref(null)
const panel = ref(null)
const sheet = ref(null)
const workspaceHeight = ref(0)
const safeBottom = ref(0)
const offset = ref(0)
const dragging = ref(false)
const holding = ref(false)
const settling = ref(false)
const motionReady = ref(false)
const heights = computed(() => ({
  explore: Math.min(workspaceHeight.value, 88 + safeBottom.value),
  preview: Math.min(workspaceHeight.value, Math.max(workspaceHeight.value * .45, 230)),
  read: workspaceHeight.value,
}))
const sheetStyle = computed(() => props.mobile ? {
  '--panel-height': `${heights.value[props.modelValue]}px`,
  transform: `translate3d(0, ${offset.value}px, 0)`,
} : undefined)
let observer, readyFrame, settleTimer, gesture
let suppressClick = false
const finishMotion = () => {
  clearTimeout(settleTimer)
  settling.value = false
  emit('occlusion', props.mobile ? heights.value[props.modelValue] : 0)
}
const transitionEnded = event => {
  if (event.target === sheet.value && event.propertyName === 'transform') finishMotion()
}
const snap = () => {
  const target = workspaceHeight.value - heights.value[props.modelValue]
  const previous = offset.value
  offset.value = target
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!motionReady.value || reduced || Math.abs(previous - target) < 1) return finishMotion()
  settling.value = true
  // Keep covered markers out of keyboard navigation until the sheet settles.
  emit('occlusion', Math.max(workspaceHeight.value - previous, heights.value[props.modelValue]))
  clearTimeout(settleTimer)
  settleTimer = setTimeout(finishMotion, 280)
}
const measure = () => {
  cancelAnimationFrame(readyFrame)
  motionReady.value = false
  cancelGesture()
  workspaceHeight.value = sheet.value.parentElement.clientHeight
  safeBottom.value = parseFloat(getComputedStyle(panel.value).paddingBottom) || 0
  offset.value = workspaceHeight.value - heights.value[props.modelValue]
  finishMotion()
  readyFrame = requestAnimationFrame(() => { motionReady.value = true })
}
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(sheet.value.parentElement)
  measure()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(readyFrame)
  clearTimeout(settleTimer)
  cancelGesture()
})
watch(() => props.mobile, measure, { flush: 'post' })
watch(() => [props.modelValue, props.short], () => { if (!dragging.value) snap() }, { flush: 'post' })
const change = value => { emit('update:modelValue', value); toggle.value?.focus({ preventScroll: true }) }
const expand = event => {
  if (suppressClick && event.detail !== 0) { suppressClick = false; return }
  suppressClick = false
  change(props.modelValue === 'read' ? 'explore' : props.modelValue === 'preview' || props.short ? 'read' : 'preview')
}
const startDrag = event => {
  if (!event.isPrimary || event.button !== 0 || event.target.closest('a, button:not(.panel-toggle)')) return
  clearTimeout(settleTimer)
  const workspace = sheet.value.parentElement.getBoundingClientRect()
  const currentOffset = sheet.value.getBoundingClientRect().top - workspace.top - sheet.value.parentElement.clientTop
  const target = event.target.closest('button') || event.currentTarget
  gesture = { pointer: event.pointerId, target, startY: event.clientY, startOffset: currentOffset, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, moved: false, scroll: panel.value.querySelector('.map-programme')?.scrollTop || 0 }
  suppressClick = false
  holding.value = true
  settling.value = false
  offset.value = currentOffset
  target.setPointerCapture(event.pointerId)
}
const moveDrag = event => {
  if (!gesture || event.pointerId !== gesture.pointer) return
  const delta = event.clientY - gesture.startY
  if (!gesture.moved && Math.abs(delta) < 5) return
  if (!gesture.moved) {
    gesture.moved = true
    dragging.value = true
    // During direct manipulation, avoid per-frame marker and layout work.
    emit('occlusion', workspaceHeight.value)
  }
  const elapsed = event.timeStamp - gesture.lastTime
  if (elapsed > 0) gesture.velocity = (event.clientY - gesture.lastY) / elapsed
  gesture.lastY = event.clientY
  gesture.lastTime = event.timeStamp
  offset.value = Math.max(0, Math.min(workspaceHeight.value - heights.value.explore, gesture.startOffset + delta))
}
const cancelGesture = () => {
  const active = gesture
  gesture = null
  holding.value = false
  dragging.value = false
  if (active?.target.hasPointerCapture(active.pointer)) active.target.releasePointerCapture(active.pointer)
  if (active?.moved) nextTick(() => {
    const programme = panel.value?.querySelector('.map-programme')
    if (programme) programme.scrollTop = active.scroll
  })
}
const endDrag = event => {
  if (!gesture || event.pointerId !== gesture.pointer) return
  const moved = gesture.moved
  const velocity = event.timeStamp - gesture.lastTime < 100 ? gesture.velocity : 0
  const projected = offset.value + Math.max(-80, Math.min(80, velocity * 120))
  const states = props.short ? ['explore', 'read'] : ['explore', 'preview', 'read']
  const nearest = states.reduce((best, state) => Math.abs(workspaceHeight.value - heights.value[state] - projected) < Math.abs(workspaceHeight.value - heights.value[best] - projected) ? state : best)
  cancelGesture()
  suppressClick = moved
  if (moved && nearest !== props.modelValue) change(nearest)
  else snap()
}
const cancelDrag = () => {
  if (!gesture) return
  suppressClick = gesture.moved
  cancelGesture()
  snap()
}
</script>
<style scoped>
.map-sheet, .map-panel { display: contents; }
.map-sheet.is-mobile { position: absolute; z-index: 700; inset: 0; display: block; background: white; }
.map-sheet.can-animate { transition: transform 240ms cubic-bezier(.22,1,.36,1); }
.map-sheet.is-moving { will-change: transform; }
.map-panel.is-mobile { display: flex; flex-direction: column; min-height: 0; height: var(--panel-height); background: white; border-top: 1px solid var(--color-gray-300); padding-bottom: env(safe-area-inset-bottom); }
.map-panel.is-dragging { height: 100%; }
.panel-header { flex: none; padding: 0 1rem; touch-action: none; user-select: none; }
.panel-handle { display: block; width: 2rem; height: 3px; background: var(--color-gray-300); margin: 8px auto 0; border-radius: 2px; }
.panel-heading { display: flex; gap: .75rem; align-items: center; }
.panel-toggle { display: flex; flex: 1; min-width: 0; min-height: 68px; gap: .75rem; align-items: center; justify-content: space-between; text-align: left; cursor: pointer; }
.panel-toggle > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.panel-back { min-height: 44px; font-size: var(--text-xs); color: var(--ui-primary); cursor: pointer; }
.is-explore .panel-toggle > span:first-child > span:first-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.is-mobile :deep(.map-programme) { flex: 1; border-top: 1px solid var(--color-gray-200); opacity: 1; transition: opacity 160ms ease-out; }
.is-explore:not(.is-dragging) :deep(.map-programme) { visibility: hidden; opacity: 0; }
@media (prefers-reduced-motion: reduce) { .map-sheet.can-animate, .is-mobile :deep(.map-programme) { transition: none; } }
</style>
