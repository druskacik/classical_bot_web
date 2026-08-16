<template>
  <main class="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
    <header class="mx-auto max-w-2xl text-center">
      <h1 class="font-serif text-3xl text-gray-950">Sources</h1>
      <p class="mt-2 text-gray-600">
        Websites represented in the current concert listings.
      </p>
    </header>

    <div class="mx-auto mt-10 max-w-7xl sm:mt-12">
      <section
        aria-labelledby="aggregator-sources-heading"
        class="grid gap-5 border-y border-gray-200 py-6 lg:grid-cols-[minmax(11rem,0.24fr)_1fr] lg:gap-10"
      >
        <div>
          <h2 id="aggregator-sources-heading" class="font-serif text-2xl text-gray-900">
            Aggregator sources
          </h2>
          <p class="mt-2 max-w-md text-sm leading-6 text-gray-600">
            These aggregator sources were used to discover classical music concert websites.
          </p>
        </div>

        <ul class="grid content-start gap-x-8 sm:grid-cols-3">
          <li v-for="source in aggregatorSources" :key="source.url">
            <a
              :href="source.url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex min-h-11 items-center break-words text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {{ source.name }}
            </a>
          </li>
        </ul>
      </section>

      <section aria-labelledby="concert-sources-heading" class="mt-12">
        <div class="mb-5">
          <h2 id="concert-sources-heading" class="font-serif text-2xl text-gray-900">
            Concert sources
          </h2>
          <p class="mt-2 text-sm leading-6 text-gray-600">
            Websites represented in upcoming concert listings, grouped by country.
          </p>
        </div>

        <div v-if="status === 'pending'">
          <UProgress animation="swing" />
        </div>
        <UAlert v-else-if="status === 'error'" color="error" title="Sources could not be loaded">
          Please try again later.
        </UAlert>
        <div v-else class="border-b border-gray-200">
          <section
            v-for="country in sourceGroups"
            :key="country.code"
            class="grid gap-2 border-t border-gray-200 py-5 lg:grid-cols-[minmax(11rem,0.24fr)_1fr] lg:gap-10"
          >
            <h3 class="font-serif text-xl text-gray-900">
              {{ country.name }}
            </h3>

            <ul class="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
              <li v-for="source in country.sources" :key="`${source.name}-${source.url}`">
                <a
                  :href="source.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex min-h-11 max-w-full items-center break-words text-sm leading-5 text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {{ source.name }}
                </a>
              </li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
const aggregatorSources = [
  { name: 'classical.sk', url: 'https://classical.sk/' },
  { name: 'bachtrack.com', url: 'https://bachtrack.com/' },
  { name: 'classicalconcertmap.com', url: 'https://classicalconcertmap.com/' },
]

useSeoMeta({
  title: 'Sources — ClassicalBot',
  description: 'Concert websites represented in ClassicalBot and the aggregators used to discover them.',
})

const {
  data: sourceGroups,
  status,
} = await useAsyncData('sources', () => $fetch('/api/get-sources'))
</script>
