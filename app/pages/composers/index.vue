<template>
  <main class="composer-surface mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
    <header class="max-w-2xl">
      <h1 class="font-serif text-4xl text-gray-950 sm:text-5xl">Composers</h1>
      <p class="mt-5 font-serif text-2xl leading-snug text-gray-800 sm:text-3xl">Discover a composer.<br>Find your next concert.</p>
      <p class="mt-4 max-w-xl leading-7 text-gray-600">Explore the works appearing in upcoming programmes, listen to our Spotify selections, and find where to hear them live.</p>
    </header>
    <div v-if="status === 'pending'" class="mt-12" role="status"><UProgress animation="swing" /><span class="sr-only">Loading composers</span></div>
    <div v-else-if="error" class="mt-12" role="alert">
      <p>Composers could not be loaded.</p>
      <button class="composer-action mt-3 min-h-11 cursor-pointer" @click="refresh()">Try again</button>
    </div>
    <ComposerGallery v-else-if="data?.items.length" :composers="data.items" eager class="mt-12 sm:mt-14" />
    <p v-else class="mt-12 text-gray-600">Composer playlists will appear here when they are published.</p>
  </main>
</template>

<script setup>
import { classicalBotSite } from '../../../site.config.js'
const { data, status, error, refresh } = await useAsyncData('composer-directory', () => $fetch('/api/composers'))
if (import.meta.server && error.value) setResponseStatus(useRequestEvent(), 503)
const canonical = `${classicalBotSite.origin}/composers`
useSeoMeta({
  title: 'Composers — ClassicalBot', ogTitle: 'Composers — ClassicalBot',
  description: 'Discover composers through their most played upcoming works, Spotify playlists, and live concerts.',
  ogDescription: 'Discover a composer. Find your next concert.',
  ogUrl: canonical, ogType: 'website',
  ogImage: () => data.value?.items.find(item => item.cover)?.cover ? `${classicalBotSite.origin}${data.value.items.find(item => item.cover).cover}-800.webp` : undefined,
  robots: () => error.value ? 'noindex, follow' : 'index, follow',
})
useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>
