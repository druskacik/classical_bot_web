<template>
  <section aria-label="Concert filters" class="py-2">
    <div :class="['grid gap-x-6 gap-y-4', fixedCountry || fixedCity ? 'md:grid-cols-2' : 'md:grid-cols-3']">
      <label v-if="!fixedCountry" class="block">
        <span class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Country</span>
        <select
          :value="country || ''"
          :disabled="countriesLoading || countriesError"
          class="h-11 w-full border-b border-gray-300 bg-transparent text-sm text-gray-900 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
          @change="update('country', $event.target.value || null)"
        >
          <option value="">{{ countriesLoading ? 'Loading countries…' : countriesError ? 'Countries unavailable' : 'All countries' }}</option>
          <option v-for="item in countries" :key="item.code" :value="item.code">
            {{ item.name }}{{ item.count == null ? '' : ` (${item.count})` }}
          </option>
          <option v-if="!countriesLoading && !countriesError && !countries.length" disabled>No matching countries</option>
        </select>
        <span v-if="countriesError" class="mt-2 block text-xs text-gray-600">Countries could not be loaded. <button type="button" class="cursor-pointer text-primary underline" @click="$emit('retry-countries')">Try again</button></span>
      </label>

      <FilterAutocomplete
        v-if="!fixedCity"
        type="city"
        :context="optionContext"
        label="City"
        placeholder="Any city"
        :country="effectiveCountry"
        :model-value="city ? [city] : []"
        @update:model-value="update('city', $event.at(-1) || null)"
      />

      <div>
        <label class="block">
          <span class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">When</span>
          <select :value="dateMode" class="h-11 w-full border-b border-gray-300 bg-transparent text-sm text-gray-900 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" @change="selectDateMode($event.target.value)">
            <option value="any">Any upcoming date</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="weekend">This weekend</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        <p v-if="dateSummary" class="mt-2 text-xs text-gray-600">{{ dateSummary }}</p>
        <div v-if="dateMode === 'custom'" class="mt-3 grid grid-cols-2 gap-4">
          <label class="min-w-0 text-xs text-gray-600">From
            <input type="date" :max="dateTo || undefined" :value="dateFrom || ''" class="mt-1 h-11 w-full min-w-0 border-b border-gray-300 bg-transparent text-sm text-gray-900 focus-visible:outline-2 focus-visible:outline-primary" @change="update('dateFrom', $event.target.value || null)">
          </label>
          <label class="min-w-0 text-xs text-gray-600">To
            <input type="date" :min="dateFrom || undefined" :value="dateTo || ''" class="mt-1 h-11 w-full min-w-0 border-b border-gray-300 bg-transparent text-sm text-gray-900 focus-visible:outline-2 focus-visible:outline-primary" @change="update('dateTo', $event.target.value || null)">
          </label>
        </div>
      </div>
    </div>

    <button type="button" class="mt-3 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden" :aria-expanded="musicExpanded" :aria-controls="musicId" @click="musicExpanded = !musicExpanded">
      Composer or work
      <UIcon :name="musicExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" aria-hidden="true" />
    </button>
    <div :id="musicId" :class="[musicExpanded ? 'grid' : 'hidden', 'mt-3 gap-5 md:mt-5 md:grid md:grid-cols-2']">
      <FilterAutocomplete
        type="composer"
        :context="optionContext"
        :show-count="false"
        :city-id="fixedCity"
        label="Composer"
        placeholder="Search composers"
        :country="effectiveCountry"
        :model-value="composers"
        @update:model-value="update('composers', $event)"
      />
      <FilterAutocomplete
        type="work"
        :context="optionContext"
        :show-count="false"
        :city-id="fixedCity"
        label="Work"
        placeholder="Search works or composers"
        :country="effectiveCountry"
        :model-value="works"
        @update:model-value="update('works', $event)"
      />
    </div>

    <div v-if="activeFilterCount" class="mt-4 flex min-h-11 items-center justify-between">
      <p class="text-xs text-gray-500">{{ activeFilterCount }} active {{ activeFilterCount === 1 ? 'filter' : 'filters' }}</p>
      <button type="button" class="cursor-pointer text-sm text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" @click="$emit('clear')">Clear filters</button>
    </div>
  </section>
</template>

<script setup>
import { concertDatePreset, formatConcertDateRange, resolveConcertDateMode } from '~/utils/concert-discovery.js'

const props = defineProps({
  countries: { type: Array, required: true },
  countriesLoading: Boolean,
  countriesError: Boolean,
  fixedCountry: { type: String, default: null },
  fixedCity: { type: String, default: null },
  country: { type: String, default: null },
  city: { type: String, default: null },
  dateFrom: { type: String, default: null },
  dateTo: { type: String, default: null },
  datePreset: { type: String, default: null },
  composers: { type: Array, required: true },
  works: { type: Array, required: true },
})

const emit = defineEmits(['update', 'clear', 'retry-countries'])
const musicId = useId()
const musicExpanded = ref(Boolean(props.composers.length || props.works.length))
watch(() => [props.composers.join(','), props.works.join(',')], () => {
  if (props.composers.length || props.works.length) musicExpanded.value = true
})
const chosenDateMode = ref(null)
// Resolve local-calendar presets after hydration, never using the server's timezone.
const localNow = ref(null)
onMounted(() => { localNow.value = new Date() })
const dateMode = computed(() => {
  const chosen = chosenDateMode.value
  if (chosen?.mode === 'custom' && !props.datePreset && chosen.dateFrom === props.dateFrom && chosen.dateTo === props.dateTo) return 'custom'
  return resolveConcertDateMode(props.datePreset, props.dateFrom, props.dateTo, localNow.value)
})
const dateSummary = computed(() => formatConcertDateRange(props.dateFrom, props.dateTo))
const selectDateMode = (mode) => {
  localNow.value = new Date()
  const range = mode === 'custom' ? { dateFrom: props.dateFrom, dateTo: props.dateTo } : concertDatePreset(mode, localNow.value)
  chosenDateMode.value = { mode, ...range }
  emit('update', { changes: { ...range, datePreset: ['today', 'week', 'weekend'].includes(mode) ? mode : null } })
}
const optionContext = computed(() => ({
  city: props.fixedCity || props.city || undefined,
  dateFrom: props.dateFrom || undefined,
  dateTo: props.dateTo || undefined,
  composers: props.composers.join(',') || undefined,
  works: props.works.join(',') || undefined,
}))
const effectiveCountry = computed(() => props.fixedCountry || props.country || null)
const activeFilterCount = computed(() => [
  !props.fixedCountry && props.country,
  !props.fixedCity && props.city,
  props.dateFrom,
  props.dateTo,
  ...props.composers,
  ...props.works,
].filter(Boolean).length)

const update = (key, value) => emit('update', { key, value })
</script>
