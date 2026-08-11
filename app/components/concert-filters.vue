<template>
  <section aria-label="Concert filters" class="py-5">
    <div class="grid gap-x-6 gap-y-5 md:grid-cols-2 lg:grid-cols-4">
      <label v-if="!fixedCountry" class="block">
        <span class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Country</span>
        <select
          :value="country || ''"
          class="h-11 w-full border-b border-gray-300 bg-transparent text-sm text-gray-900 outline-none focus:border-primary"
          @change="update('country', $event.target.value || null)"
        >
          <option value="">All countries</option>
          <option v-for="item in countries" :key="item.code" :value="item.code">
            {{ item.name }} ({{ item.count }})
          </option>
        </select>
      </label>

      <FilterAutocomplete
        :class="fixedCountry && 'lg:col-span-2'"
        type="city"
        label="City"
        placeholder="Any city"
        :country="effectiveCountry"
        :model-value="city ? [city] : []"
        @update:model-value="update('city', $event.at(-1) || null)"
      />

      <label class="block">
        <span class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">From</span>
        <input
          type="date"
          :value="dateFrom || ''"
          class="h-11 w-full border-b border-gray-300 bg-transparent text-sm text-gray-900 outline-none focus:border-primary"
          @change="update('dateFrom', $event.target.value || null)"
        >
      </label>

      <label class="block">
        <span class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">To</span>
        <input
          type="date"
          :min="dateFrom || undefined"
          :value="dateTo || ''"
          class="h-11 w-full border-b border-gray-300 bg-transparent text-sm text-gray-900 outline-none focus:border-primary"
          @change="update('dateTo', $event.target.value || null)"
        >
      </label>
    </div>

    <div class="mt-6 grid gap-6 border-t border-gray-100 pt-5 md:grid-cols-2">
      <FilterAutocomplete
        type="composer"
        label="Composer"
        placeholder="Search composers"
        :country="effectiveCountry"
        :model-value="composers"
        @update:model-value="update('composers', $event)"
      />
      <FilterAutocomplete
        type="work"
        label="Work"
        placeholder="Search works or composers"
        :country="effectiveCountry"
        :model-value="works"
        @update:model-value="update('works', $event)"
      />
    </div>

    <div v-if="activeFilterCount" class="mt-8 flex items-center justify-between">
      <p class="text-xs text-gray-500">{{ activeFilterCount }} active {{ activeFilterCount === 1 ? 'filter' : 'filters' }}</p>
      <button type="button" class="text-sm text-primary hover:underline" @click="$emit('clear')">Clear filters</button>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  countries: { type: Array, required: true },
  fixedCountry: { type: String, default: null },
  country: { type: String, default: null },
  city: { type: String, default: null },
  dateFrom: { type: String, default: null },
  dateTo: { type: String, default: null },
  composers: { type: Array, required: true },
  works: { type: Array, required: true },
})

const emit = defineEmits(['update', 'clear'])
const effectiveCountry = computed(() => props.fixedCountry || props.country || null)
const activeFilterCount = computed(() => [
  !props.fixedCountry && props.country,
  props.city,
  props.dateFrom,
  props.dateTo,
  ...props.composers,
  ...props.works,
].filter(Boolean).length)

const update = (key, value) => emit('update', { key, value })
</script>
