<template>
  <ol class="list-none divide-y divide-gray-200 border border-gray-200 bg-white">
    <li
      v-for="concert in props.concerts"
      :key="concert.id"
      class="px-4 py-4 sm:px-6 hover:bg-gray-50"
    >
      <div class="grid gap-2 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-0">
        <div class="flex flex-wrap items-baseline gap-x-2 lg:block">
          <span class="text-sm text-gray-900">{{ formatDate(concert.date) }}</span>
          <time
            v-if="formatTime(concert.time_from)"
            :datetime="formatDateTime(concert.date, concert.time_from)"
            class="text-sm tabular-nums text-gray-500 lg:mt-1 lg:block"
          >
            {{ formatTime(concert.time_from) }}
          </time>
        </div>

        <div class="min-w-0 space-y-2 [overflow-wrap:anywhere]">
          <a
            :href="concert.url"
            target="_blank"
            rel="noopener noreferrer"
            class="block text-base font-medium text-gray-900 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ concert.title }}
            <span class="sr-only"> (opens in a new tab)</span>
          </a>

          <div class="flex flex-wrap items-start gap-2">
            <span v-if="props.currentCityId && String(concert.city_id) === props.currentCityId" :class="badgeClasses(concert.city, 'outline')">{{ concert.city }}</span>
            <NuxtLink v-else :to="cityPath(concert)" :prefetch="false" :rel="concert.city_path ? undefined : 'nofollow'">
              <span :class="badgeClasses(concert.city, 'outline')">{{ concert.city }}</span>
            </NuxtLink>
            <NuxtLink v-if="props.showCountry" :to="countryPath(concert.country_code)" :prefetch="false">
              <span :class="badgeClasses(getCountryName(concert.country_code), 'outline')">
                {{ getCountryName(concert.country_code) }}
              </span>
            </NuxtLink>
            <a
              v-if="concert.source_url"
              :href="concert.source_url"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Visit ${concert.source} website`"
            >
              <span :class="badgeClasses(concert.source)">{{ concert.source }}</span>
            </a>
            <span v-else :class="badgeClasses(concert.source)">{{ concert.source }}</span>
          </div>

          <div class="flex flex-wrap items-baseline">
            <NuxtLink
              v-for="composer in concert.composers"
              :key="composer.id"
              :to="composerPath(composer.name)"
              :prefetch="false"
              rel="nofollow"
              class="composer-link inline-block py-0.5 text-sm font-medium text-gray-500 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {{ composer.name }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </li>
  </ol>
</template>

<script setup>
import { getCountryName } from '~/utils/countries.js'
import { concertCityLocation, concertCountryLocation, concertComposerLocation } from '~/utils/concert-discovery.js'

const BADGE_BASE_CLASSES = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium'
const BADGE_OUTLINE_CLASSES = {
  primary: 'text-primary ring ring-inset ring-primary/50',
  error: 'text-error ring ring-inset ring-error/50',
  red: 'text-red ring ring-inset ring-red/50',
  orange: 'text-orange ring ring-inset ring-orange/50',
  amber: 'text-amber ring ring-inset ring-amber/50',
  yellow: 'text-yellow ring ring-inset ring-yellow/50',
  lime: 'text-lime ring ring-inset ring-lime/50',
  green: 'text-green ring ring-inset ring-green/50',
  emerald: 'text-emerald ring ring-inset ring-emerald/50',
  teal: 'text-teal ring ring-inset ring-teal/50',
  cyan: 'text-cyan ring ring-inset ring-cyan/50',
  sky: 'text-sky ring ring-inset ring-sky/50',
  blue: 'text-blue ring ring-inset ring-blue/50',
  indigo: 'text-indigo ring ring-inset ring-indigo/50',
  violet: 'text-violet ring ring-inset ring-violet/50',
  purple: 'text-purple ring ring-inset ring-purple/50',
  fuchsia: 'text-fuchsia ring ring-inset ring-fuchsia/50',
  pink: 'text-pink ring ring-inset ring-pink/50',
  rose: 'text-rose ring ring-inset ring-rose/50',
}
const SPECIAL_BADGE_COLORS = {
  Bratislava: 'blue',
  Košice: 'red',
  Prešov: 'green',
  Nitra: 'yellow',
  Trenčín: 'purple',
  Žilina: 'pink',
  'Banská Bystrica': 'indigo',
}
const BADGE_COLORS_BY_NIBBLE = [
  'pink',
  'fuchsia',
  'purple',
  'violet',
  'indigo',
  'blue',
  'sky',
  'cyan',
  'teal',
  'emerald',
  'green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'red',
]
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const props = defineProps({
  currentCityId: { type: String, default: null },
  concerts: {
    type: Array,
    required: true,
  },
  showCountry: {
    type: Boolean,
    default: true,
  },
})

const route = useRoute()

const formatTime = (timeString) => {
  if (typeof timeString !== 'string') return null

  const match = timeString.match(/^(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : null
}

const formatDate = dateString => dateFormatter.format(new Date(dateString))

const formatDateTime = (dateString, timeString) => {
  const time = formatTime(timeString)
  return time ? `${dateString.slice(0, 10)}T${time}` : undefined
}

const badgeColor = (label) => {
  if (SPECIAL_BADGE_COLORS[label]) return SPECIAL_BADGE_COLORS[label]

  let hash = 0
  for (let index = 0; index < label.length; index += 1) {
    hash = label.charCodeAt(index) + ((hash << 5) - hash)
  }

  return BADGE_COLORS_BY_NIBBLE[((hash & 0xFF) >> 4)] || 'rose'
}

const badgeClasses = (label, variant = 'solid') => {
  const color = badgeColor(label)
  const colorClasses = variant === 'outline'
    ? BADGE_OUTLINE_CLASSES[color]
    : 'bg-gray-100 text-gray-700'
  return `${BADGE_BASE_CLASSES} ${colorClasses}`
}

const cityPath = concert => concertCityLocation(route.query, concert)
const countryPath = country => concertCountryLocation(route.query, country)
const composerPath = composer => concertComposerLocation(route, composer)

</script>

<style scoped>
.composer-link:not(:last-child)::after {
  display: inline-block;
  margin-right: 0.25rem;
  content: ',';
  text-decoration: none;
}
</style>
