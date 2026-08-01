<template>
  <ConcertListPage
    :title="`Classical music concerts in ${country.name}`"
    :country-code="country.code"
  />
</template>

<script setup>
import { normalizeCountryCode } from '~/utils/countries.js'

const route = useRoute()
const requestedCode = normalizeCountryCode(route.params.code)

const { data: countries } = await useAsyncData(
  'countries',
  () => $fetch('/api/get-countries'),
)

const country = countries.value?.find(item => item.code === requestedCode)

if (!country) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Country not found',
  })
}

useSeoMeta({
  title: `Classical music concerts in ${country.name} — ClassicalBot`,
  description: `Discover upcoming classical music concerts in ${country.name}.`,
})
</script>
