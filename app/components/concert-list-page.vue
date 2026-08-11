<template>
  <main class="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
    <h1 class="mx-auto max-w-4xl text-center font-serif text-3xl text-gray-950 sm:text-4xl">{{ title }}</h1>

    <div class="mx-auto mt-8 max-w-6xl">
      <ConcertFilters
        :countries="countries || []"
        :fixed-country="countryCode"
        :country="filters.country"
        :city="filters.city"
        :date-from="filters.dateFrom"
        :date-to="filters.dateTo"
        :composers="filters.composers"
        :works="filters.works"
        @update="updateFilter"
        @clear="clearFilters"
      />

      <div ref="resultsHeading" class="mt-8 flex min-h-8 items-center justify-between gap-4" tabindex="-1">
        <p v-if="concertPage" class="text-sm text-gray-600" aria-live="polite">
          {{ resultSummary }}
        </p>
        <span v-if="concertStatus === 'pending' && concertPage" class="text-xs text-gray-400">Updating…</span>
      </div>

      <div v-if="concertStatus === 'pending' && !concertPage" class="py-10">
        <UProgress animation="swing" />
      </div>
      <UAlert v-else-if="concertStatus === 'error'" class="mt-6" color="error" title="Concerts could not be loaded">
        Please check the selected dates and try again.
      </UAlert>
      <div
        v-else-if="concertPage?.items.length"
        :class="['transition-opacity duration-200', concertStatus === 'pending' ? 'opacity-55' : 'opacity-100']"
        :aria-busy="concertStatus === 'pending'"
      >
        <div v-for="(concertGroup, month) in groupedConcerts" :key="month" class="mt-9">
          <h2 class="mb-4 font-serif text-2xl capitalize text-gray-900">{{ month }}</h2>
          <ConcertsTable :concerts="concertGroup" :show-country="!countryCode" />
        </div>

        <nav v-if="concertPage.totalPages > 1" class="mt-10 flex items-center justify-center gap-1" aria-label="Concert pages">
          <button
            type="button"
            class="pagination-link"
            :disabled="concertPage.page === 1"
            aria-label="Previous page"
            @click="goToPage(concertPage.page - 1)"
          >
            ←
          </button>
          <template v-for="item in paginationItems" :key="item.key">
            <span v-if="item.ellipsis" class="px-2 text-gray-400" aria-hidden="true">…</span>
            <button
              v-else
              type="button"
              :class="['pagination-link', item.page === concertPage.page && 'pagination-link-active']"
              :aria-current="item.page === concertPage.page ? 'page' : undefined"
              :aria-label="`Page ${item.page}`"
              @click="goToPage(item.page)"
            >
              {{ item.page }}
            </button>
          </template>
          <button
            type="button"
            class="pagination-link"
            :disabled="concertPage.page === concertPage.totalPages"
            aria-label="Next page"
            @click="goToPage(concertPage.page + 1)"
          >
            →
          </button>
        </nav>
      </div>
      <div v-else class="py-16 text-center">
        <p class="font-serif text-xl text-gray-800">No upcoming concerts match these filters.</p>
        <button type="button" class="mt-3 cursor-pointer text-sm text-primary hover:underline" @click="clearFilters">Clear filters</button>
      </div>
    </div>
  </main>
</template>

<script setup>
const props = defineProps({
  title: { type: String, required: true },
  countryCode: { type: String, default: null },
})

const route = useRoute()
const router = useRouter()
const resultsHeading = ref(null)
const firstValue = value => Array.isArray(value) ? value[0] : value
const listValue = value => typeof firstValue(value) === 'string'
  ? [...new Set(firstValue(value).split(',').map(item => item.trim()).filter(Boolean))]
  : []

const filters = computed(() => ({
  country: props.countryCode || firstValue(route.query.country) || null,
  city: firstValue(route.query.city) || null,
  dateFrom: firstValue(route.query.dateFrom) || null,
  dateTo: firstValue(route.query.dateTo) || null,
  composers: listValue(route.query.composers),
  works: listValue(route.query.works),
  page: Number(firstValue(route.query.page)) || 1,
}))

const requestParams = computed(() => ({
  country: filters.value.country || undefined,
  city: filters.value.city || undefined,
  dateFrom: filters.value.dateFrom || undefined,
  dateTo: filters.value.dateTo || undefined,
  composers: filters.value.composers.length ? filters.value.composers.join(',') : undefined,
  works: filters.value.works.length ? filters.value.works.join(',') : undefined,
  page: filters.value.page > 1 ? filters.value.page : undefined,
}))

const { data: countries } = await useAsyncData('countries', () => $fetch('/api/get-countries'))
const { data: concertPage, status: concertStatus } = await useAsyncData(
  `concerts-${props.countryCode || 'all'}`,
  () => $fetch('/api/get-concerts', { params: requestParams.value }),
  { watch: [requestParams] },
)

const groupedConcerts = computed(() => (concertPage.value?.items || []).reduce((groups, concert) => {
  const month = new Date(concert.date).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  if (!groups[month]) groups[month] = []
  groups[month].push(concert)
  return groups
}, {}))

const resultSummary = computed(() => {
  const total = concertPage.value?.total || 0
  if (!total) return 'No concerts'
  const first = (concertPage.value.page - 1) * concertPage.value.pageSize + 1
  const last = Math.min(first + concertPage.value.items.length - 1, total)
  return `${total.toLocaleString('en-GB')} ${total === 1 ? 'concert' : 'concerts'} · showing ${first}–${last}`
})

const paginationItems = computed(() => {
  const current = concertPage.value?.page || 1
  const total = concertPage.value?.totalPages || 1
  const pages = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2])
  const validPages = [...pages].filter(page => page >= 1 && page <= total).sort((a, b) => a - b)
  const items = []
  validPages.forEach((page, index) => {
    if (index && page - validPages[index - 1] > 1) items.push({ key: `ellipsis-${page}`, ellipsis: true })
    items.push({ key: `page-${page}`, page })
  })
  return items
})

const cleanQuery = (query) => Object.fromEntries(
  Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
)

const updateFilter = async ({ key, value }) => {
  const queryKey = key === 'country' ? 'country' : key
  await router.push({
    query: cleanQuery({
      ...route.query,
      [queryKey]: Array.isArray(value) ? (value.length ? value.join(',') : undefined) : value || undefined,
      page: undefined,
      ...(key === 'country' ? { city: undefined } : {}),
    }),
  })
}

const clearFilters = async () => {
  await router.push({ query: {} })
}

const goToPage = async (page) => {
  if (page < 1 || page > (concertPage.value?.totalPages || 1) || page === concertPage.value?.page) return
  await router.push({
    query: cleanQuery({ ...route.query, page: page === 1 ? undefined : String(page) }),
  })
  await nextTick()
  resultsHeading.value?.focus({ preventScroll: true })
  resultsHeading.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<style scoped>
.pagination-link {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  color: var(--color-gray-600);
  font-size: 0.875rem;
  transition: border-color 150ms, color 150ms;
}

.pagination-link:hover:not(:disabled) {
  border-color: var(--color-gray-300);
  color: var(--color-gray-950);
}

.pagination-link:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.pagination-link:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

.pagination-link-active {
  border-color: var(--color-gray-900);
  color: var(--color-gray-950);
}
</style>
