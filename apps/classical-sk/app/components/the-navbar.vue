<template>
  <SiteNavbar :items="items" brand-name="classical.sk" :labels="labels" :external-icon="false" />
</template>
<script setup>
const labels = { navigation: 'Hlavná navigácia', home: 'classical.sk – domov', open: 'Otvoriť menu', close: 'Zavrieť menu', menu: 'Navigačné menu' }
const { data: cities, error, refresh } = await useAsyncData('sk-cities', () => $fetch('/api/get-cities'))
const items = computed(() => [
  {
    label: 'Mestá',
    children: error.value
      ? [{ label: 'Mestá sa nepodarilo načítať. Skúsiť znova', onSelect: () => refresh() }]
      : cities.value?.length
        ? cities.value.map(city => ({ label: city.name, href: city.path }))
        : [{ label: 'Žiadne mestá s nadchádzajúcimi koncertmi.', disabled: true }],
    slot: 'countries',
  },
  { label: 'Zdroje', href: '/zdroje' },
  { label: 'O projekte', href: '/blog/o-projekte' },
  { label: 'Kontakt', href: '/kontakt' },
  {
    label: 'Koncerty vo svete',
    href: 'https://classicalbot.com',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
])
</script>
