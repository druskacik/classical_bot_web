<template>
  <ConcertListPage
    :title="`Classical music concerts in ${country.name}`"
    :country-code="country.code"
  />
</template>

<script setup>
import { getCountrySlug } from '#layers/concerts/app/utils/countries.js'

const route = useRoute()
definePageMeta({ key: route => route.path })
const requestedSlug = typeof route.params.country === 'string'
  ? route.params.country
  : null

const { data: countries } = await useCountries()

const country = countries.value?.find(item => getCountrySlug(item.name) === requestedSlug)

if (!country) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Country not found',
  })
}

useConcertListSeo({
  title: `Classical music concerts in ${country.name} — ClassicalBot`,
  description: `Discover upcoming classical music concerts in ${country.name}.`,
  canonicalPath: `/${requestedSlug}`,
})
</script>
