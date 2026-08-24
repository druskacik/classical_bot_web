export const useCountries = () => useAsyncData(
  'countries',
  () => $fetch('/api/get-countries'),
)
