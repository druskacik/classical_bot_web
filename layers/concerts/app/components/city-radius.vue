<template>
  <FilterAutocomplete compact type="city" :context="context" :country="country" :label="t('City')" :placeholder="t('Any city')" :model-value="city ? [city] : []" @update:model-value="changeCity">
    <template #trailing>
      <div class="shrink-0" :title="help">
        <form v-if="custom && city" class="flex h-8 items-center gap-1 rounded-full bg-primary/10 pl-2.5 pr-1 text-xs text-primary" @submit.prevent="apply" @keydown.esc.stop.prevent="cancel">
          <input :id="`${id}-custom`" ref="customInput" v-model="draft" :aria-label="t('Radius in km')" type="number" min="0" max="500" step="1" required class="radius-number w-12 min-w-0 bg-transparent text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary" @keydown.enter.stop>
          <span aria-hidden="true">km</span>
          <button type="submit" :disabled="!valid" :aria-label="t('Set')" class="flex size-7 items-center justify-center rounded-full hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"><UIcon name="i-lucide-check" class="size-4" /></button>
        </form>
        <select v-else :id="id" ref="control" :aria-label="t('Radius')" :value="String(radius || 0)" :disabled="!city" class="h-8 max-w-28 cursor-pointer rounded-full border-0 bg-primary/10 px-2.5 text-xs text-primary outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:bg-gray-100 disabled:text-gray-500" @change="choose($event.target.value)">
          <option value="0">+ 0 km</option>
          <option v-for="km in presets" :key="km" :value="String(km)">+ {{ km }} km</option>
          <option v-if="radius > 0 && !presets.includes(radius)" :value="String(radius)">+ {{ radius }} km</option>
          <option value="custom">{{ t('Custom…') }}</option>
        </select>
      </div>
    </template>
  </FilterAutocomplete>
</template>
<script setup>
const props = defineProps({ city: { type: String, default: null }, radius: { type: Number, default: 0 }, country: { type: String, default: null }, context: { type: Object, default: () => ({}) } })
const emit = defineEmits(['change'])
const { t } = useConcertText()
const { concertSite } = useAppConfig()
const siteCountry = concertSite.country
const presets = [25, 50, 100, 200, 500]
const id = useId()
const control = ref(null)
const customInput = ref(null)
const custom = ref(false)
const help = computed(() => `${t('Straight-line distance from the city centre.')} ${siteCountry ? t('Only concerts in Slovakia') : ''}`.trim())
const draft = ref(String(props.radius || 0))
const valid = computed(() => draft.value !== '' && Number.isInteger(Number(draft.value)) && Number(draft.value) >= 0 && Number(draft.value) <= 500)
watch(() => props.radius, radius => { draft.value = String(radius || 0); custom.value = false })
const changeCity = values => { custom.value = false; emit('change', { city: values.at(-1) || null, radius: values.length ? props.radius : 0 }) }
const choose = async value => {
  custom.value = value === 'custom'
  if (custom.value) { draft.value = String(props.radius || 0); await nextTick(); customInput.value?.focus(); customInput.value?.select() }
  else emit('change', { city: props.city, radius: Number(value) })
}
const restoreFocus = () => nextTick(() => control.value?.focus())
const cancel = () => { custom.value = false; draft.value = String(props.radius || 0); restoreFocus() }
const apply = () => { if (props.city && valid.value) { custom.value = false; emit('change', { city: props.city, radius: Number(draft.value) }); restoreFocus() } }
defineExpose({ focusRadius: () => control.value?.focus() })
</script>

<style scoped>
.radius-number { appearance: textfield; -moz-appearance: textfield; }
.radius-number::-webkit-inner-spin-button,
.radius-number::-webkit-outer-spin-button { appearance: none; margin: 0; }
@media (pointer: coarse) {
  select, form { min-height: 2.75rem; }
  form button { min-width: 2.75rem; min-height: 2.75rem; }
}
</style>
