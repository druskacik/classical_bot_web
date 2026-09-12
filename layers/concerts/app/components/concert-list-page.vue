<template>
  <main class="container mx-auto px-4 py-5 sm:py-8 sm:px-6 lg:px-8">
    <h1 class="mx-auto max-w-4xl text-center font-serif text-3xl text-gray-950 sm:text-4xl">{{ title }}</h1>

    <div class="mx-auto mt-5 max-w-6xl">
      <ConcertFilters
        :countries="filterCountries"
        :countries-loading="countryOptionsStatus === 'pending'"
        :countries-error="countryOptionsStatus === 'error'"
        @retry-countries="refreshCountryOptions()"
        :fixed-country="countryCode"
        :fixed-city="cityPage?.id || cityPage?.filterValue || null"
        :fixed-city-id="cityPage?.id || null"
        :country="filters.country"
        :city="filters.city"
        :date-from="filters.dateFrom"
        :date-to="filters.dateTo"
        :date-preset="filters.datePreset"
        :composers="filters.composers"
        :works="filters.works"
        @update="updateFilter"
        @clear="clearFilters"
      />

      <div ref="resultsHeading" class="mt-3 flex min-h-8 items-center justify-between gap-4" tabindex="-1">
        <p v-if="concertPage" class="text-sm text-gray-600" aria-live="polite">
          {{ resultSummary }}
        </p>
        <span v-if="concertStatus === 'pending' && concertPage" class="text-xs text-gray-400">{{ t('Updating…') }}</span>
      </div>

      <div v-if="concertStatus === 'pending' && !concertPage" class="py-10">
        <UProgress animation="swing" />
      </div>
      <UAlert v-else-if="concertStatus === 'error'" class="mt-6" color="error" :title="t('Concerts could not be loaded')">
        <template #description>
          {{ t('Try again, or adjust the selected filters.') }}
          <button type="button" class="ml-2 underline" @click="refreshConcerts()">{{ t('Retry') }}</button>
        </template>
      </UAlert>
      <div
        v-else-if="concertPage?.items.length"
        :class="['transition-opacity duration-200', concertStatus === 'pending' ? 'opacity-55' : 'opacity-100']"
        :aria-busy="concertStatus === 'pending'"
      >
        <div v-for="(concertGroup, month) in groupedConcerts" :key="month" class="mt-4 sm:mt-6">
          <h2 class="mb-4 font-serif text-2xl capitalize text-gray-900">{{ month }}</h2>
          <ConcertsTable :concerts="concertGroup" :show-country="!countryCode" :current-city-id="cityPage?.id || null" />
        </div>

        <nav v-if="concertPage.totalPages > 1" class="mt-10 flex items-center justify-center gap-1" :aria-label="t('Concert pages')">
          <button
            type="button"
            class="pagination-link"
            :disabled="concertPage.page === 1"
            :aria-label="t('Previous page')"
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
              :aria-label="t('Page {page}', { page: item.page })"
              @click="goToPage(item.page)"
            >
              {{ item.page }}
            </button>
          </template>
          <button
            type="button"
            class="pagination-link"
            :disabled="concertPage.page === concertPage.totalPages"
            :aria-label="t('Next page')"
            @click="goToPage(concertPage.page + 1)"
          >
            →
          </button>
        </nav>
      </div>
      <div v-else class="py-16 text-center">
        <p class="font-serif text-xl text-gray-800">{{ cityPage && !hasRemovableFilters ? t('No upcoming concerts listed in {city}.', { city: cityPage.name }) : t('No upcoming concerts match these filters.') }}</p>
        <div class="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <button v-if="filters.dateFrom || filters.dateTo" type="button" class="min-h-11 cursor-pointer text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="updateFilter({ changes: { dateFrom: null, dateTo: null } })">{{ t('Try any date') }}</button>
          <button v-if="filters.composers.length || filters.works.length" type="button" class="min-h-11 cursor-pointer text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="updateFilter({ changes: { composers: [], works: [] } })">{{ t('Remove music filters') }}</button>
        </div>
        <button v-if="!cityPage || hasRemovableFilters" type="button" class="mt-3 cursor-pointer text-sm text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" @click="clearFilters">{{ t('Clear filters') }}</button>
        <NuxtLink v-else :to="cityParentPath" class="mt-3 inline-block text-sm text-primary hover:underline">{{ cityParentPath === '/' ? t('Browse all concerts') : t('Browse concerts in {country}', { country: cityPage.countryName }) }}</NuxtLink>
      </div>
    </div>
  </main>
</template>

<script setup>
const { t, locale, plural } = useConcertText()
import { cleanConcertQuery, updateConcertQuery } from '../utils/concert-discovery.js'
const props = defineProps({
  title: { type: String, required: true },
  countryCode: { type: String, default: null },
  cityPage: { type: Object, default: null },
})

const { concertSite } = useAppConfig()
const route = useRoute()
const router = useRouter()
const resultsHeading = ref(null)
const firstValue = value => Array.isArray(value) ? value[0] : value
const listValue = value => typeof firstValue(value) === 'string'
  ? [...new Set(firstValue(value).split(',').map(item => item.trim()).filter(Boolean))]
  : []

const filters = computed(() => ({
  country: props.countryCode || firstValue(route.query.country) || null,
  city: props.cityPage?.id || props.cityPage?.filterValue || firstValue(route.query.city) || null,
  dateFrom: firstValue(route.query.dateFrom) || null,
  dateTo: firstValue(route.query.dateTo) || null,
  datePreset: firstValue(route.query.datePreset) || null,
  composers: listValue(route.query.composers),
  works: listValue(route.query.works),
  page: Number(firstValue(route.query.page)) || 1,
}))

const hasRemovableFilters = computed(() => Boolean(
  filters.value.dateFrom || filters.value.dateTo || filters.value.composers.length || filters.value.works.length,
))

const requestParams = computed(() => ({
  country: filters.value.country || undefined,
  city: filters.value.city || undefined,
  dateFrom: filters.value.dateFrom || undefined,
  dateTo: filters.value.dateTo || undefined,
  composers: filters.value.composers.length ? filters.value.composers.join(',') : undefined,
  works: filters.value.works.length ? filters.value.works.join(',') : undefined,
  page: filters.value.page > 1 ? filters.value.page : undefined,
}))

const countriesRequest = useCountries()
const concertsRequest = useAsyncData(
  computed(() => `concerts:${JSON.stringify(requestParams.value)}`),
  () => $fetch('/api/get-concerts', { params: requestParams.value }),
)
const [
  { data: countries },
  { data: concertPage, status: concertStatus, error: concertError, refresh: refreshConcerts },
] = await Promise.all([countriesRequest, concertsRequest])

const countryOptionParams = computed(() => ({
  type: 'country',
  dateFrom: requestParams.value.dateFrom,
  dateTo: requestParams.value.dateTo,
  composers: requestParams.value.composers,
  works: requestParams.value.works,
  selected: filters.value.country || undefined,
}))
const { data: countryOptions, status: countryOptionsStatus, refresh: refreshCountryOptions } = await useAsyncData(
  computed(() => `country-options:${JSON.stringify(countryOptionParams.value)}`),
  () => props.countryCode ? Promise.resolve({ items: [] }) : $fetch('/api/get-concert-filter-options', { params: countryOptionParams.value }),
)
const filterCountries = computed(() => {
  if (countryOptionsStatus.value === 'success') return (countryOptions.value?.items || []).map(item => ({ code: item.value, name: item.label, count: item.count }))
  const selected = countries.value?.find(item => item.code === filters.value.country)
  return selected ? [{ ...selected, count: null }] : []
})

const cityParentPath = computed(() => countries.value?.some(country => country.code === props.countryCode)
  ? props.cityPage?.countryPath || '/'
  : '/')

if (props.cityPage) {
  if (concertError.value) {
    throw createError({ statusCode: concertError.value.statusCode || 500, statusMessage: t('Concerts could not be loaded') })
  }
  useConcertListSeo({
    title: () => `${props.title} — ${concertSite.name}`,
    description: () => t('Discover upcoming classical music concerts in {city}, {country}.', { city: props.cityPage.name, country: props.cityPage.countryName }),
    canonicalPath: () => props.cityPage.path,
    indexable: () => concertStatus.value === 'success' && (concertPage.value?.total || 0) > 0,
  })
}

const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
const groupedConcerts = computed(() => (concertPage.value?.items || []).reduce((groups, concert) => {
  const month = monthFormatter.format(new Date(concert.date))
  if (!groups[month]) groups[month] = []
  groups[month].push(concert)
  return groups
}, {}))

const resultSummary = computed(() => {
  const total = concertPage.value?.total || 0
  if (!total) return t('No concerts')
  const first = (concertPage.value.page - 1) * concertPage.value.pageSize + 1
  const last = Math.min(first + concertPage.value.items.length - 1, total)
  return t('{total} {concerts} · showing {first}–{last}', { total: total.toLocaleString(locale), concerts: plural('concert', total), first, last })
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

const updateFilter = async ({ key, value, changes }) => {
  await router.push({ query: updateConcertQuery(route.query, changes || { [key]: value }) })
}

const clearFilters = async () => {
  await router.push({ query: {} })
}

const goToPage = async (page) => {
  if (page < 1 || page > (concertPage.value?.totalPages || 1) || page === concertPage.value?.page) return
  await router.push({
    query: cleanConcertQuery({ ...route.query, page: page === 1 ? undefined : String(page) }),
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
