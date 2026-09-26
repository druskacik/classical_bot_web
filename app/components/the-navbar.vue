<template>
  <SiteNavbar :items="items" />
</template>
<script setup>
import { getCountryPath } from '#layers/concerts/app/utils/countries.js'
const { data: countries } = await useCountries()

const items = computed(() => [
    {
        label: 'Countries',
        children: (countries.value || []).map(country => ({
            label: country.name,
            href: getCountryPath(country.code),
        })),
        slot: 'countries'
    },
    { label: 'Map', href: '/map' },
    { label: 'Composers', href: '/composers' },
    { label: 'Sources', href: '/sources' },
    { label: 'Blog', href: '/blog' },
    { label: 'About', href: '/about' },
    { label: 'API', href: '/api' },
    { label: 'Contact', href: '/contact' },
]);
</script>
