<template>
  <nav class="bg-white" aria-label="Hlavná navigácia">
    <div class="container mx-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-4">
      <NuxtLink to="/" class="font-serif text-2xl text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" aria-label="classical.sk – domov">classical.sk</NuxtLink>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
        <details ref="cityMenu" class="relative" @keydown.escape="closeCities">
          <summary class="min-h-11 cursor-pointer content-center hover:text-gray-950 focus-visible:outline-2 focus-visible:outline-primary">Mestá</summary>
          <ul class="absolute left-0 z-30 max-h-80 w-64 overflow-y-auto border border-gray-200 bg-white p-2 shadow-lg sm:left-auto sm:right-0">
            <li v-for="city in cities || []" :key="city.path">
              <NuxtLink :to="city.path" class="block min-h-11 px-3 py-2.5 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-primary" @click="closeCities">{{ city.name }}</NuxtLink>
            </li>
            <li v-if="error" class="p-3">Mestá sa nepodarilo načítať. <button type="button" class="underline" @click="refresh()">Skúsiť znova</button></li>
            <li v-else-if="!cities?.length" class="p-3">Žiadne mestá s nadchádzajúcimi koncertmi.</li>
          </ul>
        </details>
        <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="inline-flex min-h-11 items-center hover:text-gray-950 focus-visible:outline-2 focus-visible:outline-primary">{{ link.label }}</NuxtLink>
      </div>
    </div>
  </nav>
</template>
<script setup>
const links = [{ to: '/zdroje', label: 'Zdroje' }, { to: '/blog/o-projekte', label: 'O projekte' }, { to: '/kontakt', label: 'Kontakt' }]
const { data: cities, error, refresh } = await useAsyncData('sk-cities', () => $fetch('/api/get-cities'))
const cityMenu = ref(null)
const closeCities = () => { if (cityMenu.value) cityMenu.value.open = false }
const route = useRoute()
watch(() => route.fullPath, closeCities)
</script>
