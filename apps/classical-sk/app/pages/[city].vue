<template>
  <ConcertListPage :title="`Koncerty klasickej hudby – ${city.name}`" country-code="SK" :city-page="city" />
</template>
<script setup>
definePageMeta({ key: route => route.path })
const route = useRoute()
const { data: city, error } = await useAsyncData(`sk-city:${route.path}`, () => $fetch('/api/get-city-page', { query: { path: `/${route.params.city}` } }))
if (error.value || !city.value) throw createError({ statusCode: error.value?.statusCode || 404, statusMessage: 'Mesto sa nepodarilo nájsť' })
</script>
