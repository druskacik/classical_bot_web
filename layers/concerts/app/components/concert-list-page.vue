<template>
  <main class="concert-list-page container mx-auto px-4 py-4 sm:py-8 sm:px-6 lg:px-8">
    <h1 :class="{ 'home-title': !countryCode && !cityPage }" class="mx-auto max-w-4xl text-center font-serif text-gray-950 sm:text-4xl">{{ presentation?.heading || title }}</h1>
    <p v-if="presentation?.profilePath" class="mt-3 text-center text-sm">
      <NuxtLink :to="presentation.profilePath" class="text-primary hover:underline">{{ presentation.profileLabel }}</NuxtLink>
    </p>

    <div class="mx-auto mt-3 max-w-6xl sm:mt-5">
      <ConcertFilters
        ref="filterControls"
        :radius="radius"
        :area-query="activeAreaQuery"
        :bounds="concertQuery.bounds || null"
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
      <div ref="resultsHeading" class="results-heading mt-1 flex min-h-8 flex-col items-start gap-1 sm:mt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" tabindex="-1">
        <p v-if="concertPage" class="text-sm text-gray-600" aria-live="polite">
          {{ resultSummary }}
        </p>
        <div class="flex w-full flex-wrap items-center gap-x-6 gap-y-1 sm:ml-auto sm:w-auto sm:justify-end">
          <slot v-if="!emptyResults" name="alerts" :criteria="requestParams" />
          <NuxtLink :to="concertMapLocation(concertQuery, filters.city, filters.country)" class="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm text-primary hover:underline"><UIcon name="i-lucide-map" class="size-4" />{{ t('Map') }}</NuxtLink>
        </div>
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
          <a
            v-if="concertPage.page > 1"
            :href="pageHref(concertPage.page - 1)"
            class="pagination-link"
            :aria-label="t('Previous page')"
            @click="goToPage($event, concertPage.page - 1)"
          >
            <UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />
          </a>
          <button v-else type="button" class="pagination-link" disabled :aria-label="t('Previous page')">
            <UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />
          </button>
          <template v-for="item in paginationItems" :key="item.key">
            <span v-if="item.ellipsis" class="px-2 text-gray-400" aria-hidden="true">…</span>
            <a
              v-else
              :href="pageHref(item.page)"
              :class="['pagination-link', item.page === concertPage.page && 'pagination-link-active']"
              :aria-current="item.page === concertPage.page ? 'page' : undefined"
              :aria-label="t('Page {page}', { page: item.page })"
              @click="goToPage($event, item.page)"
            >
              {{ item.page }}
            </a>
          </template>
          <a
            v-if="concertPage.page < concertPage.totalPages"
            :href="pageHref(concertPage.page + 1)"
            class="pagination-link"
            :aria-label="t('Next page')"
            @click="goToPage($event, concertPage.page + 1)"
          >
            <UIcon name="i-lucide-arrow-right" class="size-4" aria-hidden="true" />
          </a>
          <button v-else type="button" class="pagination-link" disabled :aria-label="t('Next page')">
            <UIcon name="i-lucide-arrow-right" class="size-4" aria-hidden="true" />
          </button>
        </nav>
      </div>
      <div v-else class="py-16 text-center">
        <p class="font-serif text-xl text-gray-800">{{ cityPage && !hasRemovableFilters ? t('No upcoming concerts listed in {city}.', { city: cityPage.name }) : t('No upcoming concerts match these filters.') }}</p>
        <div v-if="emptyResults && $slots.alerts" class="mt-3 flex justify-center text-left"><slot name="alerts" :criteria="requestParams" /></div>
        <div class="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <button v-if="radius" type="button" class="min-h-11 cursor-pointer text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="filterControls?.editArea()">{{ t('Increase distance') }}</button>
          <button v-if="filters.dateFrom || filters.dateTo" type="button" class="min-h-11 cursor-pointer text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="updateFilter({ changes: { dateFrom: null, dateTo: null } })">{{ t('Try any date') }}</button>
          <button v-if="filters.composers.length || filters.works.length" type="button" class="min-h-11 cursor-pointer text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="updateFilter({ changes: { composers: [], works: [] } })">{{ t('Remove music filters') }}</button>
        </div>
        <button v-if="!cityPage || hasRemovableFilters" type="button" class="mt-3 cursor-pointer text-sm text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" @click="clearFilters">{{ t('Clear all filters') }}</button>
        <NuxtLink v-else :to="cityParentPath" class="mt-3 inline-block text-sm text-primary hover:underline">{{ cityParentPath === '/' ? t('Browse all concerts') : t('Browse concerts in {country}', { country: cityPage.countryName }) }}</NuxtLink>
      </div>
    </div>
  </main>
</template>

<script setup>
const { t, locale, plural } = useConcertText()
import { concertMapLocation, cityRadiusLocation, updateConcertQuery } from '../utils/concert-discovery.js'
import { concertListPresentation, concertLocationKey } from '../utils/concert-list-presentation.js'
import { createConcertDateFormatting } from '../utils/concert-dates.js'
import { useConcertListing } from '../composables/useConcertListing.js'
import { useConcertQuery } from '../composables/useConcertQuery.js'
import { isSubjectDiscoveryQuery, subjectMatchesQuery, subjectMetadata, subjectListingPath } from '../../shared/utils/subject-discovery.js'
const props = defineProps({
  title: { type: String, required: true },
  countryCode: { type: String, default: null },
  cityPage: { type: Object, default: null },
  seoTitle: { type: String, default: null },
  seoDescription: { type: String, default: null },
  canonicalPath: { type: String, default: null },
})

const { concertSite } = useAppConfig()
const route = useRoute()
const router = useRouter()
const resultsHeading = ref(null)
const filterControls = ref(null)
const { query: concertQuery, update: updateQuery } = useConcertQuery(route, router)

const {
  activeAreaQuery, unresolvedArea, radius, filters, requestParams, countries,
  concertPage, concertStatus, concertError, refreshConcerts, countryOptionsStatus, refreshCountryOptions,
  filterCountries, displayPage, ready,
} = useConcertListing(props, concertQuery)
await ready

const hasRemovableFilters = computed(() => Boolean(
  unresolvedArea.value || filters.value.dateFrom || filters.value.dateTo || filters.value.composers.length || filters.value.works.length,
))
const emptyResults = computed(() => concertStatus.value === 'success' && concertPage.value?.total === 0)

const cityParentPath = computed(() => countries.value?.some(country => country.code === props.countryCode)
  ? props.cityPage?.countryPath || '/'
  : '/')

if (concertError.value) {
  throw createError({ statusCode: concertError.value.statusCode || 500, statusMessage: t('Concerts could not be loaded') })
}
const approvedSubjectQuery = computed(() => concertSite.subjectDiscovery && isSubjectDiscoveryQuery(route.query))
const presentation = computed(() => {
  if (!concertSite.subjectDiscovery) return null
  const query = requestParams.value
  const page = displayPage.value
  const sameLocation = concertLocationKey(query) === concertLocationKey(page?.displayQuery)
  const fixedCity = props.cityPage && !radius.value && !unresolvedArea.value
    ? { label: props.cityPage.name, countryCode: props.cityPage.countryCode } : null
  return concertListPresentation(query, {
    subject: page?.discovery?.status === 'resolved' ? page.discovery.subject : null,
    city: fixedCity || (sameLocation ? page?.displayCity : null),
    area: sameLocation ? page?.area : null,
  })
})
// SEO eligibility still controls canonical pagination, independently of display text.
const discoveryMeta = computed(() => {
  const discovery = concertPage.value?.discovery
  if (!approvedSubjectQuery.value || discovery?.status !== 'resolved' || !subjectMatchesQuery(discovery.subject, route.query)) return null
  const locationPhrase = props.cityPage ? `in ${props.cityPage.name}, ${props.cityPage.countryName}`
    : props.countryCode ? `in ${countries.value?.find(country => country.code === props.countryCode)?.name || props.countryCode}` : 'worldwide'
  return subjectMetadata(discovery.subject, locationPhrase)
})
const requestEvent = useRequestEvent()
if (requestEvent && approvedSubjectQuery.value && concertStatus.value === 'success'
  && (concertPage.value?.discovery?.status === 'unknown'
    || (concertPage.value?.discovery?.status === 'resolved' && concertPage.value.total === 0))) {
  setResponseStatus(requestEvent, 404)
}
useConcertListSeo({
  title: () => presentation.value?.title || props.seoTitle || `${props.title} — ${concertSite.name}`,
  description: () => presentation.value?.description || discoveryMeta.value?.description || props.seoDescription || (props.cityPage
    ? t('Discover upcoming classical music concerts in {city}, {country}.', { city: props.cityPage.name, country: props.cityPage.countryName })
    : undefined),
  canonicalPath: () => props.cityPage?.path || props.canonicalPath || route.path,
  indexable: () => concertStatus.value === 'success' && (concertPage.value?.total || 0) > 0,
  discovery: () => concertPage.value?.discovery,
})

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

const updateFilter = ({ key, value, changes }) => updateQuery(changes || { [key]: value })
const changeCityRadius = ({ city, radius }) => router.push(cityRadiusLocation(concertQuery.value, city, radius))
const clearFilters = () => router.push({ query: {} })

const pageHref = page => discoveryMeta.value ? subjectListingPath(
  props.cityPage?.path || props.canonicalPath || route.path, concertPage.value.discovery.subject, page,
) : router.resolve({
  path: route.path,
  query: updateConcertQuery(concertQuery.value, { page: String(page) }, { resetPage: false }),
}).href

const goToPage = async (event, page) => {
  // Keep native link behavior for new tabs/windows and modified clicks.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  if (page < 1 || page > (concertPage.value?.totalPages || 1) || page === concertPage.value?.page) return
  if (discoveryMeta.value) await router.push(pageHref(page))
  else await updateQuery({ page: String(page) }, { resetPage: false })
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
