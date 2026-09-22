<template>
  <section :aria-label="t('Concert filters')" class="concert-filters py-1 sm:py-2">
    <div :class="['location-fields grid gap-x-6 gap-y-2 sm:gap-y-4', fixedCountry ? 'md:grid-cols-2' : 'md:grid-cols-3']">
      <label v-if="!fixedCountry" class="block">
        <span class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{{ t('Country') }}</span>
        <select
          :value="country || ''"
          :disabled="countriesLoading || countriesError"
          class="h-11 w-full border-b border-gray-300 bg-transparent text-sm text-gray-900 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
          @change="update('country', $event.target.value || null)"
        >
          <option value="">{{ countriesLoading ? t('Loading countries…') : countriesError ? t('Countries unavailable') : t('All countries') }}</option>
          <option v-for="item in countries" :key="item.code" :value="item.code">
            {{ item.name }}{{ item.count == null ? '' : ` (${item.count})` }}
          </option>
          <option v-if="!countriesLoading && !countriesError && !countries.length" disabled>{{ t('No matching countries') }}</option>
        </select>
        <span v-if="countriesError" class="mt-2 block text-xs text-gray-600">{{ t('Countries could not be loaded.') }} <button type="button" class="cursor-pointer text-primary underline" @click="$emit('retry-countries')">{{ t('Try again') }}</button></span>
      </label>

      <CityRadius ref="cityControl" :city="fixedCity || city" :radius="radius" :country="effectiveCountry" :context="cityContext" @change="$emit('city-radius', $event)" />

      <div>
        <label class="block">
          <span class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{{ t('When') }}</span>
          <select :value="dateMode" class="h-11 w-full border-b border-gray-300 bg-transparent text-sm text-gray-900 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" @change="selectDateMode($event.target.value)">
            <option value="any">{{ t('Any upcoming date') }}</option>
            <option value="today">{{ t('Today') }}</option>
            <option value="week">{{ t('This week') }}</option>
            <option value="weekend">{{ t('This weekend') }}</option>
            <option value="custom">{{ t('Custom dates') }}</option>
          </select>
        </label>
        <p v-if="dateSummary" class="mt-2 text-xs text-gray-600">{{ dateSummary }}</p>
        <div v-if="dateMode === 'custom'" class="mt-3 grid grid-cols-2 gap-4">
          <label class="min-w-0 text-xs text-gray-600">{{ t('From') }}
            <input type="date" :max="dateTo || undefined" :value="dateFrom || ''" class="mt-1 h-11 w-full min-w-0 border-b border-gray-300 bg-transparent text-sm text-gray-900 focus-visible:outline-2 focus-visible:outline-primary" @change="updateDate('dateFrom', $event.target.value)">
          </label>
          <label class="min-w-0 text-xs text-gray-600">{{ t('To') }}
            <input type="date" :min="dateFrom || undefined" :value="dateTo || ''" class="mt-1 h-11 w-full min-w-0 border-b border-gray-300 bg-transparent text-sm text-gray-900 focus-visible:outline-2 focus-visible:outline-primary" @change="updateDate('dateTo', $event.target.value)">
          </label>
        </div>
      </div>
    </div>

    <button type="button" class="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:mt-3 md:hidden" :aria-expanded="musicExpanded" :aria-controls="musicId" @click="musicExpanded = !musicExpanded">
      {{ t('Composer or work') }}
      <UIcon :name="musicExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" aria-hidden="true" />
    </button>
    <div :id="musicId" class="music-fields md:grid md:grid-cols-2" :class="musicExpanded ? 'grid' : 'hidden'">
      <FilterAutocomplete
        type="composer"
        :context="optionContext"
        :show-count="false"
        :city-id="radius ? null : fixedCityId"
        :label="t('Composer')"
        :placeholder="t('Search composers')"
        :country="effectiveCountry"
        :model-value="composers"
        @update:model-value="update('composers', $event)"
      />
      <FilterAutocomplete
        type="work"
        :context="optionContext"
        :show-count="false"
        :city-id="radius ? null : fixedCityId"
        :label="t('Work')"
        :placeholder="t('Search works or composers')"
        :country="effectiveCountry"
        :model-value="works"
        @update:model-value="update('works', $event)"
      />
    </div>

    <div v-if="activeFilterCount" class="mt-4 flex min-h-11 items-center justify-between" :class="fixedCity && 'md:col-span-3'">
      <p class="text-xs text-gray-500">{{ activeFilters(activeFilterCount) }}</p>
      <button type="button" class="cursor-pointer text-sm text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" @click="clearFilters">{{ t('Clear filters') }}</button>
    </div>
  </section>
</template>

<script setup>
const { t, locale, activeFilters } = useConcertText()
import { useConcertDateFilter } from '../composables/useConcertDateFilter.js'
import { clearAreaQuery } from '../../shared/utils/concert-area.js'

import { hasCoordinateQuery } from '../../shared/utils/concert-query.js'
const props = defineProps({
  radius: { type: Number, default: 0 },
  bounds: { type: String, default: null },
  areaQuery: { type: Object, default: () => ({}) },
  countries: { type: Array, required: true },
  countriesLoading: Boolean,
  countriesError: Boolean,
  fixedCountry: { type: String, default: null },
  fixedCity: { type: String, default: null },
  fixedCityId: { type: String, default: null },
  country: { type: String, default: null },
  city: { type: String, default: null },
  dateFrom: { type: String, default: null },
  dateTo: { type: String, default: null },
  datePreset: { type: String, default: null },
  composers: { type: Array, required: true },
  works: { type: Array, required: true },
})

const emit = defineEmits(['update', 'clear', 'retry-countries', 'city-radius'])
const { concertSite } = useAppConfig()
const siteCountry = concertSite.country
const cityControl = ref(null)
defineExpose({ editArea: () => cityControl.value?.focusRadius() })
const musicId = useId()
const musicExpanded = ref(Boolean(props.composers.length || props.works.length))
watch(() => [props.composers.join(','), props.works.join(',')], () => {
  if (props.composers.length || props.works.length) musicExpanded.value = true
})
const route = useRoute()
const { dateMode, dateSummary, selectDateMode, updateDate, resetEditor } = useConcertDateFilter(
  () => props, changes => emit('update', { changes }),
  { locale, t, navigationKey: () => route.fullPath ?? route.query },
)
const clearFilters = () => { resetEditor(); emit('clear') }
const optionContext = computed(() => ({
  bounds: props.bounds || undefined,
  ...(hasCoordinateQuery(props.areaQuery) ? props.areaQuery : {
    radius: props.radius > 0 ? String(props.radius) : undefined,
    city: props.fixedCity || props.city || undefined,
  }),
  dateFrom: props.dateFrom || undefined,
  dateTo: props.dateTo || undefined,
  composers: props.composers.join(',') || undefined,
  works: props.works.join(',') || undefined,
}))
const cityContext = computed(() => ({ ...optionContext.value, ...clearAreaQuery(), radius: undefined, city: undefined }))
const effectiveCountry = computed(() => props.radius ? null : props.fixedCountry || props.country || null)
const activeFilterCount = computed(() => [
  props.radius,
  !props.fixedCountry && props.country,
  !props.fixedCity && props.city,
  props.dateFrom,
  props.dateTo,
  ...props.composers,
  ...props.works,
].filter(Boolean).length)

const update = (key, value) => emit('update', { key, value })
</script>

<style scoped>
.concert-filters .music-fields {
  margin-top: 1.25rem;
  gap: 1.5rem;
}
.concert-filters :deep(label),
.concert-filters :deep(label > span) { color: var(--color-gray-600); }
.concert-filters :deep(input::placeholder) { color: var(--color-gray-600); opacity: 1; }
.concert-filters :deep(select) { cursor: pointer; }
.concert-filters :deep(select:disabled) { cursor: default; }
.concert-filters :deep(button) { cursor: pointer; }
.concert-filters :deep(select.border-b:focus-visible),
.concert-filters :deep(input[type='date']:focus-visible) {
  outline: none;
  box-shadow: none;
  border-bottom-color: var(--ui-primary);
  border-bottom-width: 2px;
}

@media (max-width: 767px) {
  .concert-filters .music-fields { margin-top: 0.25rem; gap: 1rem; }
}
</style>
