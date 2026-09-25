<template>
  <main class="concert-list-page container mx-auto px-4 py-4 sm:py-8 sm:px-6 lg:px-8">
    <h1 :class="{ 'home-title': !countryCode && !cityPage }" class="mx-auto max-w-4xl text-center font-serif text-gray-950 sm:text-4xl">{{ title }}</h1>

    <div class="mx-auto mt-3 max-w-6xl sm:mt-5">
      <ConcertFilters
        ref="filterControls"
        :radius="radius"
        :area-query="activeAreaQuery"
        :bounds="firstValue(concertQuery.bounds) || null"
        @city-radius="changeCityRadius"
        :countries="filterCountries"
        :countries-loading="countryOptionsStatus === 'pending'"
        :countries-error="countryOptionsStatus === 'error'"
        @retry-countries="refreshCountryOptions()"
        :fixed-country="countryCode"
        :fixed-city="cityPage?.id || cityPage?.filterValue || null"
        :fixed-city-id="cityPage?.id || null"
        :country="filters.country"
        :city="filters.city || concertPage?.area?.cityId || null"
        :date-from="filters.dateFrom"
        :date-to="filters.dateTo"
        :date-preset="filters.datePreset"
        :composers="filters.composers"
        :works="filters.works"
        @update="updateFilter"
        @clear="clearFilters"
      />

      <p v-if="concertQuery.bounds" class="mt-3 flex items-center gap-4 text-sm text-gray-600">{{ t('Map area') }} <button type="button" class="min-h-11 text-primary hover:underline" @click="updateFilter({ key: 'bounds', value: null })">{{ t('Remove map area') }}</button></p>
      <div ref="resultsHeading" class="results-heading mt-1 flex min-h-8 items-center justify-between gap-4 sm:mt-3" tabindex="-1">
        <p v-if="concertPage" class="text-sm text-gray-600" aria-live="polite">
          {{ resultSummary }}
        </p>
        <NuxtLink :to="concertMapLocation(concertQuery, filters.city)" class="ml-auto inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline"><UIcon name="i-lucide-map" class="size-4" />{{ t('Map') }}</NuxtLink>
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
        <div v-for="(concertGroup, month) in groupedConcerts" :key="month" class="concert-month mt-3 sm:mt-6">
          <h2 class="month-heading mb-2 font-serif text-2xl capitalize text-gray-900 sm:mb-4">{{ month }}</h2>
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
            <UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />
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
            <UIcon name="i-lucide-arrow-right" class="size-4" aria-hidden="true" />
          </button>
        </nav>
      </div>
      <div v-else class="py-16 text-center">
        <p class="font-serif text-xl text-gray-800">{{ cityPage && !hasRemovableFilters ? t('No upcoming concerts listed in {city}.', { city: cityPage.name }) : t('No upcoming concerts match these filters.') }}</p>
        <div class="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <button v-if="radius" type="button" class="min-h-11 cursor-pointer text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="filterControls?.editArea()">{{ t('Increase distance') }}</button>
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
import { concertMapLocation, cityRadiusLocation } from '../utils/concert-discovery.js'
import { AREA_KEYS } from '../../shared/utils/concert-area.js'
import { createConcertDateFormatting } from '../utils/concert-dates.js'
import { firstQueryValue as firstValue, querySelections as listValue, hasCoordinateQuery } from '../../shared/utils/concert-query.js'
import { useConcertQuery } from '../composables/useConcertQuery.js'
const props = defineProps({
  title: { type: String, required: true },
  countryCode: { type: String, default: null },
  cityPage: { type: Object, default: null },
})

const { concertSite } = useAppConfig()
const route = useRoute()
const router = useRouter()
const resultsHeading = ref(null)
const filterControls = ref(null)
const { query: concertQuery, update: updateQuery } = useConcertQuery(route, router)

const activeAreaQuery = computed(() => Object.fromEntries(AREA_KEYS.filter(key => concertQuery.value[key] !== undefined).map(key => [key, concertQuery.value[key]])))
const unresolvedArea = computed(() => hasCoordinateQuery(concertQuery.value))
const radius = computed(() => Number(concertQuery.value.radius) || 0)
const filters = computed(() => ({
  country: props.countryCode || firstValue(concertQuery.value.country) || null,
  city: props.cityPage?.id || props.cityPage?.filterValue || firstValue(concertQuery.value.city) || null,
  dateFrom: firstValue(concertQuery.value.dateFrom) || null,
  dateTo: firstValue(concertQuery.value.dateTo) || null,
  datePreset: firstValue(concertQuery.value.datePreset) || null,
  composers: listValue(concertQuery.value.composers),
  works: listValue(concertQuery.value.works),
  page: Number(firstValue(concertQuery.value.page)) || 1,
}))

const hasRemovableFilters = computed(() => Boolean(
  unresolvedArea.value || filters.value.dateFrom || filters.value.dateTo || filters.value.composers.length || filters.value.works.length,
))

const requestParams = computed(() => ({
  ...activeAreaQuery.value,
  bounds: concertQuery.value.bounds,
  radius: concertQuery.value.radius,
  country: unresolvedArea.value || radius.value ? undefined : filters.value.country || undefined,
  city: unresolvedArea.value ? undefined : filters.value.city || undefined,
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
  ...activeAreaQuery.value,
  bounds: concertQuery.value.bounds,
  ...(radius.value && !unresolvedArea.value ? { city: filters.value.city, radius: String(radius.value) } : {}),
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

const { groupByMonth } = createConcertDateFormatting(locale, t('Date unavailable'))
const groupedConcerts = computed(() => groupByMonth(concertPage.value?.items || []))

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
  await updateQuery(changes || { [key]: value })
}

const changeCityRadius = async ({ city, radius }) => { await router.push(cityRadiusLocation(concertQuery.value, city, radius)) }

const clearFilters = async () => {
  await router.push({ query: {} })
}

const goToPage = async (page) => {
  if (page < 1 || page > (concertPage.value?.totalPages || 1) || page === concertPage.value?.page) return
  await updateQuery({ page: String(page) }, { resetPage: false })
  await nextTick()
  resultsHeading.value?.focus({ preventScroll: true })
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  resultsHeading.value?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' })
}
</script>

<style scoped>
.concert-list-page {
  --ui-primary: var(--color-primary-600);
  max-width: 80rem;
  padding-top: 2.5rem;
  padding-bottom: 4rem;
  caret-color: var(--ui-primary);
}

.concert-list-page > h1 {
  max-width: 72rem;
  text-align: center;
  font-size: 2.25rem;
  line-height: 1.2;
  text-wrap: balance;
}

.concert-list-page > div { margin-top: 2rem; }
.concert-list-page .results-heading { margin-top: 1rem; }
.concert-list-page .month-heading {
  margin-bottom: 0;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-gray-900);
}
.concert-list-page :deep(a) { text-underline-offset: 0.2em; }
.concert-list-page :deep(a:focus-visible),
.concert-list-page :deep(button:focus-visible) { outline: 2px solid var(--ui-primary); outline-offset: 3px; }
@media (max-width: 639px) {
  .concert-list-page { padding-top: 1rem; }
  .concert-list-page > h1 { font-size: 1.875rem; line-height: 1.2; }
  .concert-list-page > h1.home-title { font-size: 1.5rem; line-height: 1.333333; }
  .concert-list-page > div { margin-top: 0.75rem; }
  .concert-list-page .results-heading { margin-top: 0.25rem; }
  .concert-list-page .month-heading { padding-bottom: 0.75rem; }
}

@media (prefers-reduced-motion: reduce) {
  .concert-list-page :deep(*) { transition: none; scroll-behavior: auto; }
}

.pagination-link {
  display: inline-flex;
  width: 2.75rem;
  height: 2.75rem;
  cursor: pointer;
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
