<template>
  <main class="map-page" :class="mobile && 'map-mobile'">
    <header class="map-heading">
      <div>
        <h1 class="font-serif text-3xl text-gray-950">{{ t('Map of classical music concerts') }}</h1>
        <p class="mt-1 text-sm text-gray-600">{{ t('Explore concerts by scrolling the map.') }} {{ t('Markers show city locations, not individual venues.') }}<template v-if="concertSite.country"> {{ t('Only concerts in Slovakia') }}.</template></p>
      </div>
      <NuxtLink :to="listLocation" class="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm text-primary hover:underline"><UIcon name="i-lucide-list" class="size-4" />{{ t('List view') }}</NuxtLink>
    </header>

    <div class="map-controls" @keydown.esc="filtersOpen = false">
      <div v-if="mobile" class="mobile-search">
        <FilterAutocomplete compact type="area-city" :label="t('Go to city')" :placeholder="t('Search cities worldwide')" :show-count="false" :model-value="jumpCity ? [jumpCity] : []" @select="jump" @update:model-value="values => { if (!values.length) clearCity() }" />
        <button ref="filterTrigger" type="button" class="map-filter-toggle" aria-haspopup="dialog" :aria-expanded="filtersOpen" @click="filtersOpen = true"><UIcon name="i-lucide-sliders-horizontal" class="size-4" />{{ t('Filters') }}<span v-if="filterCount"> · {{ filterCount }}</span></button>
      </div>
      <component :is="mobile ? 'dialog' : 'div'" ref="filterDialog" class="map-toolbar" :aria-label="mobile ? t('Concert filters') : undefined" @cancel="filtersOpen = false" @close="filtersOpen = false">
      <div v-if="mobile" class="filter-heading"><h2 class="font-serif text-2xl">{{ t('Concert filters') }}</h2><button type="button" autofocus class="min-h-11 text-primary" @click="filtersOpen = false">{{ t('Done') }}</button></div>
      <FilterAutocomplete v-if="!mobile" type="area-city" :label="t('Go to city')" :placeholder="t('Search cities worldwide')" :show-count="false" :model-value="jumpCity ? [jumpCity] : []" @select="jump" @update:model-value="values => { if (!values.length) clearCity() }" />
      <label>
        <span class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{{ t('When') }}</span>
        <select :value="dateMode" class="h-11 w-full border-b border-gray-300 bg-transparent text-sm text-gray-900 focus-visible:outline-2 focus-visible:outline-primary" @change="setDate($event.target.value)">
          <option value="any">{{ t('Any upcoming date') }}</option><option value="today">{{ t('Today') }}</option><option value="week">{{ t('This week') }}</option><option value="weekend">{{ t('This weekend') }}</option><option value="custom">{{ t('Custom dates') }}</option>
        </select>
      </label>
      <FilterAutocomplete type="composer" :label="t('Composer')" :placeholder="t('Search composers')" :show-count="false" :context="musicContext" :model-value="composers" @update:model-value="setFilter('composers', $event)" />
      <FilterAutocomplete type="work" :label="t('Work')" :placeholder="t('Search works or composers')" :show-count="false" :context="musicContext" :model-value="works" @update:model-value="setFilter('works', $event)" />
      <div v-if="dateMode === 'custom'" class="col-span-full flex flex-wrap gap-4 text-sm">
        <label class="flex min-w-0 flex-wrap items-center gap-2">{{ t('From') }} <input type="date" :value="route.query.dateFrom || ''" :max="route.query.dateTo || undefined" class="min-h-11 min-w-0 max-w-full border-b border-gray-300" @change="setFilter('dateFrom', $event.target.value)"></label>
        <label class="flex min-w-0 flex-wrap items-center gap-2">{{ t('To') }} <input type="date" :value="route.query.dateTo || ''" :min="route.query.dateFrom || undefined" class="min-h-11 min-w-0 max-w-full border-b border-gray-300" @change="setFilter('dateTo', $event.target.value)"></label>
      </div>
      <button v-if="mobile && hasMusicDates" type="button" class="min-h-11 text-left text-primary" @click="resetFilters">{{ t('Clear filters') }}</button>
    </component>

    </div>

    <div class="map-workspace" :data-panel="panelState">
      <section class="map-stage" :inert="mobile && panelState === 'read'" :aria-label="t('Explore concerts on the map')">
        <ClientOnly>
          <LazyConcertMap :obscured-height="mobile ? panelHeight : 0" :cities="mapData?.items || []" :bounds="bounds" :selected="selectedCity" :focus="focus" @bounds="moveMap" @select="selectCity" />
          <template #fallback><div class="flex h-full min-h-0 items-center justify-center bg-gray-100 text-sm text-gray-600">{{ t('Loading map…') }}</div></template>
        </ClientOnly>
        <details v-if="mobile" class="map-info"><summary :aria-label="t('About the map')"><UIcon name="i-lucide-info" class="size-5" /></summary><p>{{ t('Markers show city locations, not individual venues.') }}<template v-if="concertSite.country"> {{ t('Only concerts in Slovakia') }}.</template></p></details>
        <div v-if="!mobile || mapStatus === 'pending' || mapStatus === 'error'" class="map-caption" :style="mobile ? { bottom: `${panelHeight + 16}px` } : undefined" aria-live="polite">
          <span v-if="mapStatus === 'pending'">{{ t('Updating…') }}</span>
          <span v-else-if="mapStatus === 'error'">{{ t('Concerts could not be loaded') }} <button type="button" class="underline" @click="refreshMap()">{{ t('Retry') }}</button></span>
          <span v-else>{{ t('{count} concerts across {cities} cities', { count: (mapData?.mapped || 0).toLocaleString(locale), cities: (mapData?.items.length || 0).toLocaleString(locale) }) }}</span>
        </div>
      </section>

      <MapMobilePanel v-model="panelState" @occlusion="panelHeight = $event" :mobile="mobile" :short="shortScreen" :title="selectedName || t('In this area')" :summary="listLoading ? t('Updating…') : t('{count} concerts', { count: (concerts?.total || 0).toLocaleString(locale) })" :selected="Boolean(selectedCity)" :list-location="listLocation" @clear="clearCity">
      <section id="map-programme" ref="programmePanel" class="map-programme" :inert="mobile && panelState === 'explore'" :aria-label="t('Concert programme')" :aria-busy="listLoading">
        <div v-if="!mobile" class="border-b border-gray-200 px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <h2 class="font-serif text-2xl text-gray-950">{{ selectedName || t('In this view') }}</h2>
            <button v-if="selectedCity" type="button" class="min-h-11 shrink-0 cursor-pointer text-sm text-primary underline-offset-4 hover:underline" @click="clearCity">{{ t('Show area') }}</button>
          </div>
          <p class="mt-1 text-xs text-gray-600" aria-live="polite">{{ listLoading ? t('Updating…') : t('{count} concerts', { count: (concerts?.total || 0).toLocaleString(locale) }) }}</p>
        </div>
        <div v-if="listStatus === 'error'" class="px-5 py-8 text-sm text-gray-600">{{ t('Concerts could not be loaded') }} <button type="button" class="min-h-11 text-primary underline" @click="refreshList()">{{ t('Retry') }}</button></div>
        <div v-else-if="!listLoading && !concerts?.items.length" class="px-5 py-10">
          <h3 class="font-serif text-xl">{{ t('No concerts in this view') }}</h3>
          <p class="mt-3 text-sm text-gray-600">{{ t('Move the map, zoom out, or try another date.') }}</p>
          <button v-if="hasMusicDates" type="button" class="mt-3 min-h-11 text-sm text-primary hover:underline" @click="resetFilters">{{ t('Clear filters') }}</button>
        </div>
        <ol v-else class="divide-y divide-gray-200" :class="listLoading && 'opacity-50'">
          <li v-for="concert in concerts?.items || []" :key="concert.id" class="map-concert">
            <time :datetime="concert.date?.slice(0, 10)" class="text-center text-gray-600"><span class="block text-xs uppercase">{{ concertDate(concert.date, 'month') }}</span><span class="block font-serif text-2xl text-gray-950">{{ concertDate(concert.date, 'day') }}</span><span class="block text-xs">{{ concert.date?.slice(0, 4) }}</span></time>
            <div class="min-w-0">
              <p class="text-xs text-gray-600">{{ concert.city }}<template v-if="concert.time_from"> · {{ concert.time_from.slice(0, 5) }}</template></p>
              <a :href="concert.url" target="_blank" rel="noopener noreferrer" class="mt-1 block font-serif text-lg leading-snug text-gray-950 hover:text-primary hover:underline">{{ concert.title }}<span class="sr-only"> ({{ t('Opens in a new tab') }})</span></a>
              <p v-if="concert.venue" class="mt-1 text-xs text-gray-600">{{ concert.venue }}</p>
              <MapProgramme :composers="concert.composers" :works="concert.works" :url="concert.url" />
            </div>
          </li>
        </ol>
        <nav v-if="concerts?.totalPages > 1" class="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4" :aria-label="t('Concert pages')">
          <button type="button" :disabled="page <= 1" class="min-h-11 text-sm text-primary underline-offset-4 enabled:cursor-pointer enabled:hover:underline disabled:cursor-not-allowed disabled:opacity-30" @click="setPage(page - 1)">{{ t('Previous page') }}</button>
          <span class="text-xs tabular-nums text-gray-600">{{ page }} / {{ concerts.totalPages }}</span>
          <button type="button" :disabled="page >= concerts.totalPages" class="min-h-11 text-sm text-primary underline-offset-4 enabled:cursor-pointer enabled:hover:underline disabled:cursor-not-allowed disabled:opacity-30" @click="setPage(page + 1)">{{ t('Next page') }}</button>
        </nav>
      </section>
      </MapMobilePanel>
    </div>
  </main>
</template>
<script setup>
definePageMeta({ layout: 'map' })
import { cleanConcertQuery, concertDatePreset, resolveConcertDateMode } from '../utils/concert-discovery.js'
import { parseMapBounds } from '../../shared/utils/concert-map.js'
const { t, locale } = useConcertText()
const { concertSite } = useAppConfig()
const route = useRoute()
const router = useRouter()
const first = value => Array.isArray(value) ? value[0] : value
const values = value => typeof first(value) === 'string' ? first(value).split(',').filter(Boolean) : []
const composers = computed(() => values(route.query.composers))
const works = computed(() => values(route.query.works))
const mapCityQuery = computed(() => first(route.query.mapCity) || null)
const jumpCity = ref(null)
const focus = ref(null)
const resolvedOrigin = ref(null)
const filtersOpen = ref(false)
const mobile = ref(false)
const shortScreen = ref(false)
const panelState = ref('explore')
const panelHeight = ref(0)
const filterDialog = ref(null)
const filterTrigger = ref(null)
const filterCount = computed(() => Number(Boolean(route.query.dateFrom || route.query.dateTo || route.query.datePreset)) + composers.value.length + works.value.length)
const revealConcerts = () => { if (mobile.value) panelState.value = shortScreen.value ? 'read' : 'preview' }
let mobileQuery, shortQuery
const syncScreen = () => {
  mobile.value = mobileQuery.matches
  shortScreen.value = shortQuery.matches
  filtersOpen.value = false
  if (shortScreen.value && panelState.value === 'preview') panelState.value = 'read'
}
onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 768px), (max-width: 1024px) and (max-height: 500px) and (pointer: coarse)')
  shortQuery = window.matchMedia('(max-height: 500px)')
  syncScreen()
  if (route.query.mapCity || route.query.city || route.query.nearCity) revealConcerts()
  mobileQuery.addEventListener('change', syncScreen)
  shortQuery.addEventListener('change', syncScreen)
})
onBeforeUnmount(() => { mobileQuery?.removeEventListener('change', syncScreen); shortQuery?.removeEventListener('change', syncScreen) })
watch(filtersOpen, async open => {
  await nextTick()
  if (!mobile.value) return
  if (open) filterDialog.value?.showModal()
  else { filterDialog.value?.close(); filterTrigger.value?.focus() }
})
const resolvingOrigin = ref(Boolean(route.query.city || route.query.nearCity || route.query.mapCity))
const bounds = computed(() => { try { return parseMapBounds(first(route.query.bounds)) ? first(route.query.bounds) : null } catch { return null } })
const page = computed(() => Math.max(1, Number(first(route.query.page)) || 1))
const programmePanel = ref(null)
watch(page, () => { if (programmePanel.value) programmePanel.value.scrollTop = 0 }, { flush: 'post' })
const musicContext = computed(() => cleanConcertQuery({ dateFrom: first(route.query.dateFrom), dateTo: first(route.query.dateTo), composers: composers.value.join(','), works: works.value.join(',') }))
const hasMusicDates = computed(() => Object.keys(musicContext.value).length > 0)
const now = ref(null)
const customDates = ref(false)
onMounted(() => { now.value = new Date() })
const dateMode = computed(() => customDates.value ? 'custom' : resolveConcertDateMode(first(route.query.datePreset), first(route.query.dateFrom), first(route.query.dateTo), now.value))
const { data: mapData, status: mapStatus, refresh: refreshMap } = await useAsyncData(computed(() => `map:${JSON.stringify(musicContext.value)}`), () => $fetch('/api/get-concert-map', { params: musicContext.value }))
const cityQueryValue = city => city?.englishName && (city.country || city.country_code)
  ? `${city.englishName},${city.country || city.country_code}` : city?.id
const matchesCityQuery = (city, value) => city && value && (city.id === value || cityQueryValue(city)?.toLowerCase() === value.trim().toLowerCase())
const selectedCityDetails = computed(() => {
  const value = mapCityQuery.value
  if (matchesCityQuery(resolvedOrigin.value, value)) return resolvedOrigin.value
  return mapData.value?.items.find(city => city.id === value) || null
})
const selectedCity = computed(() => selectedCityDetails.value?.id || (/^\d+$/.test(mapCityQuery.value || '') ? mapCityQuery.value : null))
const selectedName = computed(() => selectedCityDetails.value?.name || null)
const listParams = computed(() => {
  const city = selectedCity.value || mapCityQuery.value || first(route.query.city) || first(route.query.nearCity)
  if (!city && !bounds.value) return null
  return { ...musicContext.value, ...(city ? { city } : { bounds: bounds.value }), page: page.value }
})
// A bare map has no viewport until Leaflet measures its container. Do not fetch
// worldwide rows that would immediately be replaced by the visible area's rows.
const { data: concerts, status: listStatus, refresh: refreshList } = await useAsyncData(computed(() => `map-list:${JSON.stringify(listParams.value)}`), () => listParams.value
  ? $fetch('/api/get-concerts', { params: listParams.value })
  : Promise.resolve({ items: [], total: 0, totalPages: 0 }))
const listLoading = computed(() => !listParams.value || listStatus.value === 'pending')
const listLocation = computed(() => ({ path: '/', query: cleanConcertQuery({ ...musicContext.value, ...(mapCityQuery.value ? { city: selectedCity.value || mapCityQuery.value, cityName: selectedCityDetails.value ? cityQueryValue(selectedCityDetails.value) : first(route.query.cityName) } : { bounds: bounds.value }) }) }))
const navigate = (changes, replace = false) => router[replace ? 'replace' : 'push']({ path: '/map', query: cleanConcertQuery({ ...route.query, cityName: selectedCityDetails.value ? cityQueryValue(selectedCityDetails.value) : first(route.query.cityName), mapCity: selectedCity.value || mapCityQuery.value || undefined, city: undefined, country: undefined, radius: undefined, nearCity: undefined, nearLat: undefined, nearLng: undefined, radiusKm: undefined, page: undefined, bounds: latestBounds || bounds.value || undefined, ...changes }) })
let moveTimer
let latestBounds = bounds.value
const moveMap = (value, { restoring = false } = {}) => {
  clearTimeout(moveTimer)
  // Keep the saved viewport as the URL's source of truth. fitBounds can expand
  // it for a different screen or snapped zoom without changing the user's query.
  if (restoring && bounds.value) return
  latestBounds = value
  if (value === bounds.value) return
  moveTimer = setTimeout(() => { if (!resolvingOrigin.value) navigate({ bounds: value, mapCity: selectedCity.value || mapCityQuery.value || undefined, page: restoring || mapCityQuery.value ? route.query.page : undefined }, true) }, 300)
}
const selectCity = city => { revealConcerts(); clearTimeout(moveTimer); jumpCity.value = city.id; resolvedOrigin.value = city; navigate({ mapCity: city.id, cityName: cityQueryValue(city) }) }
const jump = city => { revealConcerts(); clearTimeout(moveTimer); jumpCity.value = String(city.value); resolvedOrigin.value = { ...city, id: String(city.value), name: city.label }; focus.value = city; navigate({ mapCity: String(city.value), cityName: cityQueryValue(resolvedOrigin.value) }) }
const clearCity = () => { revealConcerts(); clearTimeout(moveTimer); jumpCity.value = null; navigate({ mapCity: undefined, cityName: undefined }) }
const setFilter = (key, value) => { clearTimeout(moveTimer); navigate({ [key]: Array.isArray(value) ? value.join(',') : value || undefined, ...(['dateFrom', 'dateTo'].includes(key) ? { datePreset: undefined } : {}) }) }
const setDate = mode => { clearTimeout(moveTimer); customDates.value = mode === 'custom'; if (customDates.value) return; navigate({ ...concertDatePreset(mode, new Date()), datePreset: mode === 'any' ? undefined : mode }) }
const resetFilters = () => navigate({ dateFrom: undefined, dateTo: undefined, datePreset: undefined, composers: undefined, works: undefined })
const setPage = value => navigate({ page: value > 1 ? String(value) : undefined })
watch(() => JSON.stringify(listParams.value), () => { if (programmePanel.value) programmePanel.value.scrollTop = 0 }, { flush: 'post' })
watch(mapCityQuery, value => { if (value) revealConcerts() })
const concertDate = (date, part) => date ? new Intl.DateTimeFormat(locale, { [part]: part === 'month' ? 'short' : 'numeric', timeZone: 'UTC' }).format(new Date(date)) : ''
watch(selectedCity, value => { jumpCity.value = value }, { immediate: true })
watch(bounds, value => { clearTimeout(moveTimer); latestBounds = value }, { flush: 'sync' })
const originQuery = computed(() => mapCityQuery.value || first(route.query.city) || first(route.query.nearCity))
onMounted(() => watch(originQuery, async origin => {
  if (!origin) { resolvingOrigin.value = false; return }
  resolvingOrigin.value = true
  // Names must resolve against the full catalogue: filtered map results can hide
  // an equally named city and make an ambiguous origin appear unique.
  let city = matchesCityQuery(resolvedOrigin.value, origin) ? resolvedOrigin.value : mapData.value?.items.find(city => city.id === origin)
  if (!city) {
    try {
      const response = await $fetch('/api/get-area-cities', { params: { origin } })
      const matches = response.items
      if (matches.length === 1) city = { ...matches[0], id: String(matches[0].value), name: matches[0].label }
    } catch { /* The programme and map remain usable without recentering. */ }
  }
  if (originQuery.value !== origin) return
  resolvingOrigin.value = false
  if (city) {
    resolvedOrigin.value = city
    if (!bounds.value) {
      // The map may have reported its default viewport during the lookup.
      // Discard it and let the city focus publish the new viewport instead.
      clearTimeout(moveTimer)
      latestBounds = null
      focus.value = { ...city, label: city.name }
    }
    if (!mapCityQuery.value) navigate({ mapCity: city.id, cityName: cityQueryValue(city), bounds: bounds.value || undefined }, true)
  }
}, { immediate: true }))
onBeforeUnmount(() => clearTimeout(moveTimer))
useConcertListSeo({ title: () => `${t('Concert map')} — ${concertSite.name}`, description: () => t('Explore upcoming classical music concerts on an interactive world map.'), canonicalPath: '/map', indexable: false })
</script>
<style scoped>
.map-page { overflow: hidden; isolation: isolate; display: grid; grid-template-rows: auto auto minmax(0, 1fr); min-width: 0; min-height: 0; width: 100%; max-width: 120rem; margin-inline: auto; }
.map-heading > div, .map-toolbar > * { min-width: 0; }
.map-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1.5rem; }
.map-controls { position: relative; z-index: 1100; min-width: 0; }
.map-filter-toggle { display: none; }
.map-toolbar { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.5rem; padding: 0 1.5rem 1.25rem; background: white; }
.map-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 25rem); grid-template-rows: minmax(0, 1fr); min-width: 0; min-height: 0; border-block: 1px solid var(--color-gray-200); }
.map-stage { position: relative; min-width: 0; min-height: 0; isolation: isolate; }
.map-caption { position: absolute; left: 1rem; top: 1rem; z-index: 500; max-width: calc(100% - 5rem); background: white; padding: .625rem .875rem; color: var(--color-gray-700); font-size: var(--text-xs); pointer-events: none; }
.map-caption button { pointer-events: auto; }
/* Contain absolute sr-only link labels inside this scrollport. Without a
   positioned ancestor they extend the document below the footer. */
.map-programme { position: relative; min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; overflow-wrap: anywhere; background: white; scrollbar-color: var(--color-gray-300) white; scrollbar-width: thin; }
.map-concert { display: grid; grid-template-columns: 2.75rem minmax(0, 1fr); gap: 1rem; padding: 1.25rem; overflow-wrap: anywhere; }
.map-page :is(button, a, input, select):focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 3px; }
.map-page ::selection { background: var(--color-blue-100); color: var(--color-gray-950); }
@media (max-width: 64rem) { .map-workspace { grid-template-columns: minmax(0, 1fr) minmax(0, 21rem); } }
/* Mobile keeps one stable map viewport behind the programme panel. */
.map-mobile { grid-template-rows: auto minmax(0, 1fr); }
.map-mobile .map-heading { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.map-mobile .map-heading a { display: none; }
.mobile-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .75rem; padding: .5rem 1rem; background: white; }
.mobile-search :deep(label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.mobile-search :deep(input) { font-size: 16px; }
.map-mobile .map-filter-toggle { display: inline-flex; gap: .4rem; align-items: center; min-height: 44px; color: var(--ui-primary); font-size: var(--text-sm); cursor: pointer; }
.map-mobile :deep(.text-primary), .map-mobile :deep(.panel-back), .map-mobile .map-filter-toggle { color: var(--color-blue-600); }
.map-mobile :deep(input::placeholder) { color: var(--color-gray-500); }
.map-mobile .map-toolbar { position: fixed; inset: 0; width: 100%; height: 100dvh; max-width: none; max-height: 100dvh; margin: 0; border: 0; padding: max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom)); overflow-y: auto; background: white; }
.map-mobile .map-toolbar:not([open]) { display: none; }
.map-mobile .map-toolbar[open] { display: flex; flex-direction: column; gap: 1.5rem; }
.map-mobile .map-toolbar :deep(input), .map-mobile .map-toolbar select { font-size: 16px; }
.filter-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.map-mobile .map-workspace { position: relative; display: block; overflow: hidden; }
.map-mobile .map-stage { position: absolute; inset: 0; }
.map-mobile .map-caption { top: auto; bottom: calc(100px + env(safe-area-inset-bottom)); left: .5rem; padding: .35rem .5rem; max-width: calc(100% - 8rem); }
.map-mobile .map-concert { padding: 1rem; gap: .75rem; }
.map-mobile :deep(.leaflet-bottom) { bottom: calc(88px + env(safe-area-inset-bottom)); }
.map-mobile [data-panel="preview"] :deep(.leaflet-bottom) { bottom: max(45%, 230px); }
.map-info { position: absolute; top: .75rem; left: .75rem; z-index: 600; background: white; border: 1px solid var(--color-gray-300); max-width: calc(100% - 5rem); font-size: var(--text-xs); }
.map-info summary { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; cursor: pointer; list-style: none; }
.map-info summary::-webkit-details-marker { display: none; }
.map-info p { padding: 0 .75rem .75rem; max-width: 17rem; }
@media (max-height: 600px) and (min-width: 48.001rem) {
  .map-heading { padding-block: .5rem; }
  .map-heading h1 { font-size: var(--text-2xl); }
  .map-heading p { font-size: var(--text-xs); }
  .map-toolbar { padding-bottom: .5rem; }
}
</style>
