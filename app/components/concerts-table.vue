<template>
    <div class="overflow-x-auto">
        <table class="min-w-full bg-white border border-gray-200">
            <tbody class="divide-y divide-gray-200">
            <tr v-for="concert in concerts" :key="concert.id" class="hover:bg-gray-50">
                <td class="px-6 py-4">
                    <div class="grid gap-2 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-0">
                        <div class="flex items-baseline gap-2 lg:block">
                            <span class="text-sm text-gray-900">{{ formatDate(concert.date) }}</span>
                            <time
                                v-if="formatTime(concert.time_from)"
                                :datetime="formatDateTime(concert.date, concert.time_from)"
                                class="text-sm tabular-nums text-gray-500 lg:mt-1 lg:block"
                            >
                                {{ formatTime(concert.time_from) }}
                            </time>
                        </div>
                        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-2">
                            <a
                                :href="concert.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="order-2 text-sm text-gray-900 font-medium hover:underline lg:order-1"
                            >
                                {{ concert.title }}
                            </a>
                            <div class="order-1 flex w-full flex-wrap gap-2 lg:order-2 lg:w-auto">
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
                            <div class="order-3 flex flex-wrap items-baseline">
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
                    </div>
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
      city: concert.country_code ? `${concert.city},${concert.country_code}` : concert.city,
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
