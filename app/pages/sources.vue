<template>
  <div class="container mx-auto py-8 px-4 md:px-8 lg:px-12">
    <h1 class="text-3xl font-serif mb-2 text-center">Sources</h1>
    <p class="mb-8 text-center text-gray-600">
      Websites represented in the current concert listings.
    </p>

    <div v-if="status === 'pending'">
      <UProgress animation="swing" />
    </div>
    <UAlert v-else-if="status === 'error'" color="error" title="Sources could not be loaded">
      Please try again later.
    </UAlert>
    <div v-else>
      <section v-for="country in sourceGroups" :key="country.code" class="mb-8">
        <h2 class="text-2xl font-serif mb-4">{{ country.name }}</h2>
        <ul class="pl-6 space-y-2">
          <li v-for="source in country.sources" :key="`${source.name}-${source.url}`">
            <a
              :href="source.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline"
            >
              {{ source.name }}
            </a>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
useSeoMeta({
  title: 'Sources — ClassicalBot',
  description: 'Concert websites represented in the ClassicalBot listings.',
})

const {
  data: sourceGroups,
  status,
} = await useAsyncData('sources', () => $fetch('/api/get-sources'))
</script>
