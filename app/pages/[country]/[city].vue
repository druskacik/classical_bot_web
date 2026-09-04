<template>
  <ConcertListPage
    :title="`Classical music concerts in ${city.name}, ${city.countryName}`"
    :country-code="city.countryCode"
    :city-page="city"
  />
</template>

<script setup>
definePageMeta({ key: route => route.path })
const route = useRoute()
const { data: city, error } = await useAsyncData(
  `city-page:${route.path}`,
  () => $fetch('/api/get-city-page', {
    query: { country: route.params.country, city: route.params.city },
  }),
)
if (error.value) {
  throw createError({
    statusCode: error.value.statusCode || 500,
    statusMessage: error.value.statusCode === 404 ? 'City not found' : 'City could not be loaded',
  })
}
</script>
