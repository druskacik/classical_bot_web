<template>
  <ol class="concert-list list-none divide-y divide-gray-200 bg-white">
    <li
      v-for="concert in props.concerts"
      :key="concert.id"
      class="concert-entry"
    >
      <div class="entry-layout grid">
        <div class="entry-date">
          <time v-if="concertCalendarDate(concert.date)" :datetime="concertCalendarDate(concert.date)" :aria-label="formatDate(concert.date)" class="calendar-date">
            <span class="calendar-weekday" aria-hidden="true">{{ weekday(concert.date) }}</span>
            <span class="calendar-day" aria-hidden="true">{{ Number(concertCalendarDate(concert.date).slice(8)) }}</span>
          </time>
          <span v-else class="text-sm text-gray-900">{{ formatDate(concert.date) }}</span>
          <time
            v-if="formatTime(concert.time_from)"
            :datetime="formatDateTime(concert.date, concert.time_from)"
            class="entry-time text-sm tabular-nums text-gray-600"
          >
            {{ formatTime(concert.time_from) }}
          </time>
        </div>

        <div class="entry-content min-w-0 space-y-2 [overflow-wrap:anywhere]">
          <a
            :href="concert.url"
            target="_blank"
            rel="noopener noreferrer"
            class="entry-title block text-base font-medium text-gray-900 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ concert.title }}
            <span class="sr-only">{{ t(' (opens in a new tab)') }}</span>
          </a>

          <div class="entry-metadata flex flex-wrap items-start gap-2">
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
              :aria-label="t('Visit {source} website', { source: concert.source })"
            >
              <span :class="badgeClasses(concert.source)">{{ concert.source }}</span>
            </a>
            <span v-else :class="badgeClasses(concert.source)">{{ concert.source }}</span>
          </div>

          <div v-if="!concert.works?.length && concert.composers?.length" class="flex flex-wrap items-baseline">
            <NuxtLink
              v-for="composer in concert.composers"
              :key="composer.id"
              :to="composerPath(composer.name)"
              :prefetch="false"
              rel="nofollow"
              class="composer-link inline-block min-h-6 max-w-full py-0.5 text-sm font-semibold leading-5 text-gray-600 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:font-normal [@media(min-width:640px)_and_(pointer:coarse)]:min-h-11"
            >
              {{ composer.name }}
            </NuxtLink>
          </div>
          <ConcertProgramme :works="concert.works || []" :composers="concert.composers || []" />
        </div>
      </div>
    </li>
  </ol>
</template>

<script setup>
const { t, locale } = useConcertText()
import { getCountryName } from '../utils/countries.js'
import { concertCalendarDate, createConcertDateFormatting, formatConcertTime as formatTime, formatConcertDateTime as formatDateTime } from '../utils/concert-dates.js'
import { concertCityLocation, concertCountryLocation, concertComposerLocation } from '../utils/concert-discovery.js'

const BADGE_BASE_CLASSES = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium'
const BADGE_OUTLINE_CLASSES = {
  primary: 'text-primary-700 border border-primary/50',
  error: 'text-red-700 border border-error/50',
  red: 'text-red-700 border border-red/50',
  orange: 'text-orange-700 border border-orange/50',
  amber: 'text-amber-700 border border-amber/50',
  yellow: 'text-yellow-700 border border-yellow/50',
  lime: 'text-lime-700 border border-lime/50',
  green: 'text-green-700 border border-green/50',
  emerald: 'text-emerald-700 border border-emerald/50',
  teal: 'text-teal-700 border border-teal/50',
  cyan: 'text-cyan-700 border border-cyan/50',
  sky: 'text-sky-700 border border-sky/50',
  blue: 'text-blue-700 border border-blue/50',
  indigo: 'text-indigo-700 border border-indigo/50',
  violet: 'text-violet-700 border border-violet/50',
  purple: 'text-purple-700 border border-purple/50',
  fuchsia: 'text-fuchsia-700 border border-fuchsia/50',
  pink: 'text-pink-700 border border-pink/50',
  rose: 'text-rose-700 border border-rose/50',
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
const { formatDate } = createConcertDateFormatting(locale, t('Date unavailable'))
const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
const weekday = value => weekdayFormatter.format(new Date(`${concertCalendarDate(value)}T00:00:00Z`))

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

const badgeColor = (label) => {
  if (SPECIAL_BADGE_COLORS[label]) return SPECIAL_BADGE_COLORS[label]

  let hash = 0
  for (let index = 0; index < label.length; index += 1) {
    hash = label.charCodeAt(index) + ((hash << 5) - hash)
  }

  return BADGE_COLORS_BY_NIBBLE[((hash & 0xFF) >> 4)] || 'rose'
}

const badgeClasses = (label, variant = 'solid') => {
  if (variant === 'solid') return 'concert-source'
  const color = badgeColor(label)
  return `${BADGE_BASE_CLASSES} ${BADGE_OUTLINE_CLASSES[color]} location-badge`
}

const cityPath = concert => concertCityLocation(route.query, concert)
const countryPath = country => concertCountryLocation(route.query, country)
const composerPath = composer => concertComposerLocation(route, composer)

</script>

<style scoped>
.concert-list .concert-entry { padding: 1.75rem 0; }
.concert-list .entry-layout { grid-template-columns: 5rem minmax(0, 1fr); gap: 1.5rem; }
.concert-list .entry-date { display: block; text-align: center; }
.calendar-date { display: flex; flex-direction: column; align-items: center; color: var(--color-gray-900); }
.calendar-weekday { font-size: 0.875rem; line-height: 1.5; color: var(--color-gray-600); }
.calendar-day { font-size: 2.25rem; line-height: 1.15; font-variant-numeric: tabular-nums; }
.concert-list .entry-time { display: block; margin-top: 0.5rem; color: var(--color-gray-600); }
.concert-list .entry-title { font-family: var(--font-serif); font-size: 1.5rem; font-weight: 400; line-height: 1.35; }
.concert-list .entry-metadata { gap: 0.5rem; align-items: baseline; font-size: 0.875rem; }
.concert-list .entry-metadata > * { display: inline-flex; align-items: center; min-height: 1.75rem; }
.concert-source { color: var(--color-gray-600); }
.concert-list .composer-link { color: var(--color-gray-700); }
.concert-list .entry-metadata a:hover > .concert-source { text-decoration: underline; text-underline-offset: 0.2em; }
.concert-list .location-badge { transition: background-color 150ms; }
.concert-list .entry-metadata a:hover > .location-badge {
  background-color: color-mix(in srgb, currentColor 5%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .concert-list .location-badge { transition: none; }
}

@media (max-width: 639px) {
  .calendar-day { font-size: 1.875rem; }
  .concert-list .entry-metadata { row-gap: 0.25rem; }
  .concert-list .entry-layout { grid-template-columns: 2.75rem minmax(0, 1fr); gap: 1rem; }
  .concert-list .concert-entry { padding: 1.5rem 0; }
  .concert-list .entry-title { font-size: 1.5rem; }
}
@media (min-width: 640px) and (pointer: coarse) {
  .concert-list .entry-metadata > a { min-height: 2.75rem; }
}

.composer-link:not(:last-child)::after {
  display: inline-block;
  margin-right: 0.25rem;
  content: ',';
  text-decoration: none;
}
</style>
