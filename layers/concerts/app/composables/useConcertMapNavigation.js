import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { mapSelectionQuery, mapListLocation } from '../utils/concert-discovery.js'
import { firstQueryValue as first, clearLocationQuery, musicQuery } from '../../shared/utils/concert-query.js'
import { parseMapBounds } from '../../shared/utils/concert-map.js'

// Public filters stay in the route; resolved IDs are only marker identity.
export function useConcertMapNavigation({ query: concertQuery, update }, mapData, lookupOrigin) {
  let disposed = false
  const selectionQuery = computed(() => mapSelectionQuery(concertQuery.value))
  const hasSelection = computed(() => Object.keys(selectionQuery.value).length > 0)
  const cityQuery = computed(() => selectionQuery.value.city || null)
  const jumpCity = ref(null)
  const focus = ref(null)
  const resolvedOrigin = ref(null)
  const resolvingOrigin = ref(Boolean(concertQuery.value.city))
  const bounds = computed(() => { try { return parseMapBounds(first(concertQuery.value.bounds)) ? first(concertQuery.value.bounds) : null } catch { return null } })
  const page = computed(() => Math.max(1, Number(first(concertQuery.value.page)) || 1))
  const musicContext = computed(() => musicQuery(concertQuery.value))
  const cityQueryValue = city => city?.cityQuery || String(city?.id || city?.value || '')
  const resolvedQuery = ref(null)
  const matchesCityQuery = (city, value) => city && value && (String(city.id) === value || (city === resolvedOrigin.value && resolvedQuery.value === value))
  const selectedCityDetails = computed(() => {
    const value = cityQuery.value
    if (matchesCityQuery(resolvedOrigin.value, value)) return resolvedOrigin.value
    return mapData.value?.items.find(city => city.id === value) || null
  })
  const selectedCity = computed(() => selectedCityDetails.value?.id || (/^\d+$/.test(cityQuery.value || '') ? cityQuery.value : null))
  const selectedName = computed(() => selectedCityDetails.value?.name || null)
  const listParams = computed(() => {
    const selection = selectionQuery.value
    if (!Object.keys(selection).length && !bounds.value) return null
    return { ...musicContext.value, ...(Object.keys(selection).length ? selection : { bounds: bounds.value }), page: page.value }
  })
  const listLocation = computed(() => mapListLocation(concertQuery.value))
  const navigate = (changes, replace = false) => {
    clearTimeout(moveTimer)
    return update({ bounds: latestBounds || bounds.value || undefined, ...changes }, {
      path: '/map', replace, clearBounds: false, resetPage: !Object.hasOwn(changes, 'page'),
    })
  }
  let moveTimer
  let latestBounds = bounds.value
  const moveMap = (value, { restoring = false } = {}) => {
    clearTimeout(moveTimer)
    // Keep the saved viewport as the URL's source of truth. fitBounds can expand
    // it for a different screen or snapped zoom without changing the user's query.
    if (restoring && bounds.value) return
    latestBounds = value
    if (value === bounds.value) return
    moveTimer = setTimeout(() => { if (!resolvingOrigin.value) navigate({ bounds: value, page: restoring || Object.keys(selectionQuery.value).length ? concertQuery.value.page : undefined }, true) }, 300)
  }
  const clearSelection = clearLocationQuery()
  const selectCity = city => {
    jumpCity.value = city.id
    resolvedOrigin.value = city
    resolvedQuery.value = cityQueryValue(city)
    return navigate({ ...clearSelection, city: resolvedQuery.value })
  }
  const jump = city => {
    const selected = { ...city, id: String(city.value), name: city.label }
    const navigation = selectCity(selected)
    focus.value = selected
    return navigation
  }
  const clearCity = () => { jumpCity.value = null; return navigate(clearSelection) }
  const setFilter = (key, value) => navigate({ [key]: value || undefined })
  const resetFilters = () => navigate({ dateFrom: undefined, dateTo: undefined, datePreset: undefined, composers: undefined, works: undefined })
  const setPage = value => navigate({ page: value > 1 ? String(value) : undefined })
  watch(selectedCity, value => { jumpCity.value = value }, { immediate: true })
  watch(concertQuery, () => clearTimeout(moveTimer), { flush: 'sync' })
  watch(bounds, value => { clearTimeout(moveTimer); latestBounds = value }, { flush: 'sync' })
  const originQuery = cityQuery
  onMounted(() => watch(originQuery, async (origin, previous, onCleanup) => {
    let obsolete = false
    onCleanup(() => { obsolete = true })
    if (!origin) { resolvingOrigin.value = false; return }
    resolvingOrigin.value = true
    // Names must resolve against the full catalogue: filtered map results can hide
    // an equally named city and make an ambiguous origin appear unique.
    let city = matchesCityQuery(resolvedOrigin.value, origin) ? resolvedOrigin.value : mapData.value?.items.find(city => city.id === origin)
    if (!city) {
      try {
        const response = await lookupOrigin(origin)
        const matches = response.items
        if (matches.length === 1) city = { ...matches[0], id: String(matches[0].value), name: matches[0].label }
      } catch { /* The programme and map remain usable without recentering. */ }
    }
    if (obsolete || disposed || originQuery.value !== origin) return
    resolvingOrigin.value = false
    if (city) {
      resolvedOrigin.value = city
      resolvedQuery.value = origin
      if (!bounds.value) {
        // The map may have reported its default viewport during the lookup.
        // Discard it and let the city focus publish the new viewport instead.
        clearTimeout(moveTimer)
        latestBounds = null
        focus.value = { ...city, label: city.name }
      }
    }
  }, { immediate: true }))
  onBeforeUnmount(() => { disposed = true; clearTimeout(moveTimer) })
  return { selectionQuery, hasSelection, cityQuery, jumpCity, focus, selectedCity, selectedName, bounds, page, listParams, listLocation, moveMap, selectCity, jump, clearCity, setFilter, resetFilters, setPage, updateFilters: navigate }
}
