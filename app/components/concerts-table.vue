<template>
    <div class="overflow-x-auto">
        <table class="min-w-full bg-white border border-gray-200">
            <tbody class="divide-y divide-gray-200">
            <tr v-for="concert in concerts" :key="concert.id" class="hover:bg-gray-50">
                <td class="px-6 py-4">
                    <!-- Mobile layout (flex column) -->
                    <div class="lg:hidden flex flex-col gap-2">
                        <span class="text-sm text-gray-900">{{ formatDate(concert.date) }}</span>
                        <div class="flex flex-wrap gap-2">
                            <TableBadge :label="concert.city" variant="outline" />
                            <NuxtLink v-if="showCountry" :to="getCountryPath(concert.country_code)">
                                <TableBadge :label="getCountryName(concert.country_code)" variant="outline" />
                            </NuxtLink>
                            <TableBadge :label="concert.source"/>
                        </div>
                        <div class="flex flex-wrap items-baseline">
                            <a :href="concert.url" target="_blank" rel="noopener noreferrer" class="text-sm text-gray-900 font-medium hover:underline mr-2">
                                {{ concert.title }}
                            </a>
                            <span v-for="(composer, index) in concert.composers" :key="composer.id" class="inline-block">
                            <span v-if="index > 0" class="text-gray-500">, </span>
                                <NuxtLink
                                    :to="composerPath(composer.name)"
                                    class="text-sm text-gray-500 font-medium hover:underline"
                                >
                                    {{ formatComposerName(composer.name) }}
                                </NuxtLink>
                            </span>
                        </div>
                    </div>

                    <!-- Desktop layout (original) -->
                    <div class="hidden lg:block">
                        <span class="text-sm text-gray-900">{{ formatDate(concert.date) }}</span>
                    </div>
                </td>
                <td class="px-6 py-4 hidden lg:table-cell">
                    <a :href="concert.url" target="_blank" rel="noopener noreferrer" class="text-sm text-gray-900 font-medium hover:underline">
                        {{ concert.title }}
                    </a>
                    <TableBadge class="ml-2" :label="concert.city" variant="outline" />
                    <NuxtLink v-if="showCountry" :to="getCountryPath(concert.country_code)" class="ml-2">
                        <TableBadge :label="getCountryName(concert.country_code)" variant="outline" />
                    </NuxtLink>
                    <TableBadge class="ml-2 mr-2" :label="concert.source"/>
                    <span v-for="(composer, index) in concert.composers" :key="composer.id" class="inline-block">
                      <span v-if="index > 0" class="text-gray-500">, </span>
                        <NuxtLink
                            :to="composerPath(composer.name)"
                            class="text-sm text-gray-500 font-medium hover:underline"
                        >
                            {{ formatComposerName(composer.name) }}
                        </NuxtLink>
                    </span>
                </td>
            </tr>
            </tbody>
        </table>
    </div>
  </template>
  
  <script setup>

  import { getCountryName, getCountryPath } from '~/utils/countries.js'

  const route = useRoute()
  defineProps({
    concerts: {
      type: Array,
      required: true
    },
    showCountry: {
      type: Boolean,
      default: true
    },
  })  
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const composerPath = composer => ({
    path: route.path,
    query: {
      ...route.query,
      composers: Array.from(new Set([
        ...selectedComposers.value,
        composer,
      ])).join(','),
    },
  })

  const selectedComposers = computed(() => {
    const value = Array.isArray(route.query.composers)
      ? route.query.composers[0]
      : route.query.composers

    return typeof value === 'string'
      ? value.split(',').map(item => item.trim()).filter(Boolean)
      : []
  })

  const formatComposerName = (composerName) => {
    const parts = composerName.split(' ')
    return parts[parts.length - 1]
  }
  
  </script>
  
  <style>
  /* Add custom styles if needed */
  </style>
