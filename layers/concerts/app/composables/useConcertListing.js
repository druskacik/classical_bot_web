import { computed, shallowRef, watch } from 'vue'
import { AREA_KEYS } from '../../shared/utils/concert-area.js'
import { composerSelections, querySelections, hasCoordinateQuery, musicQuery } from '../../shared/utils/concert-query.js'
import { useCountries } from './useCountries.js'

export function useConcertListing(props, concertQuery) {
  const activeAreaQuery = computed(() => Object.fromEntries(AREA_KEYS.filter(key => concertQuery.value[key] !== undefined).map(key => [key, concertQuery.value[key]])))
  const unresolvedArea = computed(() => hasCoordinateQuery(concertQuery.value))
  const radius = computed(() => Number(concertQuery.value.radius) || 0)
  const filters = computed(() => ({
    country: props.countryCode || concertQuery.value.country || null,
    city: props.cityPage?.id || props.cityPage?.filterValue || concertQuery.value.city || null,
    dateFrom: concertQuery.value.dateFrom || null,
    dateTo: concertQuery.value.dateTo || null,
    datePreset: concertQuery.value.datePreset || null,
    composers: composerSelections(concertQuery.value.composers),
    works: querySelections(concertQuery.value.works),
  }))
  const requestParams = computed(() => ({
    ...activeAreaQuery.value,
    bounds: concertQuery.value.bounds,
    country: unresolvedArea.value || radius.value ? undefined : filters.value.country || undefined,
    city: unresolvedArea.value ? undefined : filters.value.city || undefined,
    ...musicQuery(concertQuery.value),
    // Preserve invalid pages for API validation instead of serving page one.
    page: concertQuery.value.page,
  }))
  const countryOptionParams = computed(() => ({
    ...requestParams.value,
    country: undefined, city: undefined, page: undefined,
    ...(radius.value && !unresolvedArea.value ? { city: filters.value.city, radius: String(radius.value) } : {}),
    type: 'country', selected: filters.value.country || undefined,
  }))

  // Register all requests before awaiting, while the caller's Nuxt context is active.
  const countriesRequest = useCountries()
  const { data: countries } = countriesRequest
  const concertsRequest = useAsyncData(
    computed(() => `concerts:${JSON.stringify(requestParams.value)}`),
    async () => {
      const displayQuery = { ...requestParams.value }
      return { ...await $fetch('/api/get-concerts', { params: displayQuery }), displayQuery }
    },
  )
  const { data: concertPage, status: concertStatus, error: concertError, refresh: refreshConcerts } = concertsRequest
  const countryOptionsRequest = useAsyncData(
    computed(() => `country-options:${JSON.stringify(countryOptionParams.value)}`),
    () => props.countryCode ? Promise.resolve({ items: [] }) : $fetch('/api/get-concert-filter-options', { params: countryOptionParams.value }),
  )
  const { data: countryOptions, status: countryOptionsStatus, refresh: refreshCountryOptions } = countryOptionsRequest
  const filterCountries = computed(() => {
    if (countryOptionsStatus.value === 'success') return (countryOptions.value?.items || []).map(item => ({ code: item.value, name: item.label, count: item.count }))
    const selected = countries.value?.find(item => item.code === filters.value.country)
    return selected ? [{ ...selected, count: null }] : []
  })
  // Display labels survive pending refreshes; presentation still checks selection identity.
  const displayPage = shallowRef(concertPage.value)
  watch(concertPage, page => { if (page) displayPage.value = page }, { flush: 'sync' })
  return {
    activeAreaQuery, unresolvedArea, radius, filters, requestParams, countries,
    concertPage, concertStatus, concertError, refreshConcerts, countryOptionsStatus, refreshCountryOptions,
    filterCountries, displayPage, ready: Promise.all([countriesRequest, concertsRequest, countryOptionsRequest]),
  }
}
