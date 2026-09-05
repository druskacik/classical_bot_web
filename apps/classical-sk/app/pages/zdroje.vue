<template>
  <main class="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
    <header class="mx-auto max-w-2xl text-center">
      <h1 class="font-serif text-3xl text-gray-950">Zdroje</h1>
      <p class="mt-2 text-gray-600">Webové stránky zastúpené v aktuálnom prehľade koncertov na Slovensku.</p>
    </header>
    <div class="mx-auto mt-10 max-w-6xl">
      <UProgress v-if="status === 'pending'" animation="swing" />
      <UAlert v-else-if="status === 'error'" color="error" title="Zdroje sa nepodarilo načítať">
        <button type="button" class="min-h-11 underline" @click="refresh()">Skúsiť znova</button>
      </UAlert>
      <ul v-else-if="sources.length" class="grid gap-x-8 border-y border-gray-200 py-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="source in sources" :key="source.url">
          <a :href="source.url" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 max-w-full items-center break-words text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">{{ source.name }}</a>
        </li>
      </ul>
      <p v-else class="text-center text-gray-600">Momentálne nie sú dostupné žiadne zdroje.</p>
    </div>
  </main>
</template>
<script setup>
const { data, status, refresh } = await useAsyncData('sk-sources', () => $fetch('/api/get-sources'))
const sources = computed(() => [...(data.value?.internationalSources || []), ...(data.value?.otherSources || []), ...(data.value?.countryGroups || []).flatMap(group => group.sources)].sort((a, b) => a.name.localeCompare(b.name, 'sk')))
useSeoMeta({ title: 'Zdroje – classical.sk', description: 'Zdroje nadchádzajúcich koncertov klasickej hudby na Slovensku.' })
useHead({ link: [{ rel: 'canonical', href: 'https://classical.sk/zdroje' }] })
</script>
