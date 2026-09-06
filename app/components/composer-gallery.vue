<template>
  <ul class="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-12">
    <li v-for="(composer, index) in composers" :key="composer.id" class="min-w-0">
      <NuxtLink :to="composer.path" :prefetch="false" class="composer-gallery-link group block">
        <ComposerCover :composer="composer" :eager="eager && index < 3" />
        <h2 v-if="headingLevel === 2" class="mt-4 font-serif text-2xl text-gray-950 group-hover:underline">{{ composer.name }}</h2>
        <h3 v-else class="mt-4 font-serif text-2xl text-gray-950 group-hover:underline">{{ composer.name }}</h3>
        <p class="mt-1 text-sm text-gray-600">{{ formatCount(composer.concertCount) }} upcoming {{ composer.concertCount === 1 ? 'concert' : 'concerts' }}</p>
      </NuxtLink>
    </li>
  </ul>
</template>

<script setup>
defineProps({ composers: { type: Array, required: true }, eager: Boolean, headingLevel: { type: Number, default: 2 } })
const formatCount = count => new Intl.NumberFormat('en-GB').format(count)
</script>
