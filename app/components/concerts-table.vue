<template>
    <div class="overflow-x-auto">
        <table class="min-w-full bg-white border border-gray-200">
            <tbody class="divide-y divide-gray-200">
            <tr v-for="concert in concerts" :key="concert.id" class="hover:bg-gray-50">
                <td class="px-6 py-4">
                    <!-- Mobile layout (flex column) -->
                    <div class="lg:hidden flex flex-col gap-2">
                        <div>
                            <span class="text-sm text-gray-900">{{ formatDate(concert.date) }}</span>
                            <time
                                v-if="formatTime(concert.time_from)"
                                :datetime="formatDateTime(concert.date, concert.time_from)"
                                class="ml-2 text-sm tabular-nums text-gray-500"
                            >
                                {{ formatTime(concert.time_from) }}
                            </time>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <NuxtLink :to="cityPath(concert)">
                                <TableBadge :label="concert.city" variant="outline" />
                            </NuxtLink>
                            <NuxtLink v-if="showCountry" :to="getCountryPath(concert.country_code)">
                                <TableBadge :label="getCountryName(concert.country_code)" variant="outline" />
                            </NuxtLink>
                            <a
                                v-if="concert.source_url"
                                :href="concert.source_url"
                                target="_blank"
                                rel="noopener noreferrer"
                                :aria-label="`Visit ${concert.source} website`"
                            >
                                <TableBadge :label="concert.source" />
                            </a>
                            <TableBadge v-else :label="concert.source" />
                        </div>
                        <div class="flex flex-wrap items-baseline">
                            <a :href="concert.url" target="_blank" rel="noopener noreferrer" class="text-sm text-gray-900 font-medium hover:underline mr-2">
                                {{ concert.title }}
                            </a>
                            <span
                                v-for="(composer, index) in concert.composers"
                                :key="composer.id"
                                :class="['inline-block', index < concert.composers.length - 1 && 'mr-1']"
                            >
                                <NuxtLink
                                    :to="composerPath(composer.name)"
                                    class="text-sm text-gray-500 font-medium hover:underline"
                                >
                                    {{ composer.name }}
                                </NuxtLink><span v-if="index < concert.composers.length - 1" class="text-gray-500">,</span>
                            </span>
                        </div>
                    </div>

                    <!-- Desktop layout (original) -->
                    <div class="hidden lg:block">
                        <span class="text-sm text-gray-900">{{ formatDate(concert.date) }}</span>
                        <time
                            v-if="formatTime(concert.time_from)"
                            :datetime="formatDateTime(concert.date, concert.time_from)"
                            class="mt-1 block text-sm tabular-nums text-gray-500"
                        >
                            {{ formatTime(concert.time_from) }}
                        </time>
                    </div>
                </td>
                <td class="px-6 py-4 hidden lg:table-cell">
                    <a :href="concert.url" target="_blank" rel="noopener noreferrer" class="text-sm text-gray-900 font-medium hover:underline">
                        {{ concert.title }}
                    </a>
                    <NuxtLink :to="cityPath(concert)" class="ml-2">
                        <TableBadge :label="concert.city" variant="outline" />
                    </NuxtLink>
                    <NuxtLink v-if="showCountry" :to="getCountryPath(concert.country_code)" class="ml-2">
                        <TableBadge :label="getCountryName(concert.country_code)" variant="outline" />
                    </NuxtLink>
                    <a
                        v-if="concert.source_url"
                        :href="concert.source_url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="ml-2 mr-2 inline-block"
                        :aria-label="`Visit ${concert.source} website`"
                    >
                        <TableBadge :label="concert.source" />
                    </a>
                    <TableBadge v-else class="ml-2 mr-2" :label="concert.source" />
                    <span
                        v-for="(composer, index) in concert.composers"
                        :key="composer.id"
                        :class="['inline-block', index < concert.composers.length - 1 && 'mr-1']"
                    >
                        <NuxtLink
                            :to="composerPath(composer.name)"
                            class="text-sm text-gray-500 font-medium hover:underline"
                        >
                            {{ composer.name }}
                        </NuxtLink><span v-if="index < concert.composers.length - 1" class="text-gray-500">,</span>
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

  const formatTime = (timeString) => {
    if (typeof timeString !== 'string') return null

    const match = timeString.match(/^(\d{2}):(\d{2})/)
    return match ? `${match[1]}:${match[2]}` : null
  }

  const formatDateTime = (dateString, timeString) => {
    const time = formatTime(timeString)
    return time ? `${dateString.slice(0, 10)}T${time}` : undefined
  }

  const cityPath = concert => ({
    path: route.path,
    query: {
      ...route.query,
      city: concert.city_id ? String(concert.city_id) : concert.city,
      page: undefined,
    },
  })

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

  </script>
  
  <style>
  /* Add custom styles if needed */
  </style>
