<template>
  <ol class="list-none divide-y divide-gray-200 border border-gray-200 bg-white">
    <li
      v-for="concert in props.concerts"
      :key="concert.id"
      class="px-6 py-4 hover:bg-gray-50"
    >
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
            class="order-2 text-sm font-medium text-gray-900 hover:underline lg:order-1"
          >
            {{ concert.title }}
          </a>

          <div class="order-1 flex w-full flex-wrap gap-2 lg:order-2 lg:w-auto">
            <NuxtLink :to="cityPath(concert)" :prefetch="false">
              <span :class="badgeClasses(concert.city, 'outline')">{{ concert.city }}</span>
            </NuxtLink>
            <NuxtLink v-if="props.showCountry" :to="getCountryPath(concert.country_code)" :prefetch="false">
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

          <div class="order-3 flex flex-wrap items-baseline">
            <NuxtLink
              v-for="composer in concert.composers"
              :key="composer.id"
              :to="composerPath(composer.name)"
              :prefetch="false"
              class="composer-link inline-block py-0.5 text-sm font-medium text-gray-500 hover:underline"
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
import { getCountryName, getCountryPath } from '~/utils/countries.js'

const BADGE_BASE_CLASSES = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium'
const BADGE_SOLID_CLASSES = {
  primary: 'bg-primary text-inverted',
  error: 'bg-error text-inverted',
  red: 'bg-red text-inverted',
  orange: 'bg-orange text-inverted',
  amber: 'bg-amber text-inverted',
  yellow: 'bg-yellow text-inverted',
  lime: 'bg-lime text-inverted',
  green: 'bg-green text-inverted',
  emerald: 'bg-emerald text-inverted',
  teal: 'bg-teal text-inverted',
  cyan: 'bg-cyan text-inverted',
  sky: 'bg-sky text-inverted',
  blue: 'bg-blue text-inverted',
  indigo: 'bg-indigo text-inverted',
  violet: 'bg-violet text-inverted',
  purple: 'bg-purple text-inverted',
  fuchsia: 'bg-fuchsia text-inverted',
  pink: 'bg-pink text-inverted',
  rose: 'bg-rose text-inverted',
}
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

const selectedComposers = computed(() => {
  const value = Array.isArray(route.query.composers)
    ? route.query.composers[0]
    : route.query.composers

  return typeof value === 'string'
    ? value.split(',').map(item => item.trim()).filter(Boolean)
    : []
})

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
    : BADGE_SOLID_CLASSES[color]
  return `${BADGE_BASE_CLASSES} ${colorClasses}`
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

</script>

<style scoped>
.composer-link:not(:last-child)::after {
  display: inline-block;
  margin-right: 0.25rem;
  content: ',';
  text-decoration: none;
}
</style>
