<template>
  <ul v-if="works.length" class="concert-programme list-none space-y-3 text-sm [overflow-wrap:anywhere] sm:space-y-0">
    <li v-for="group in groups" :key="group.key" class="grid min-w-0 gap-x-4 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-y-0 sm:py-1.5">
      <NuxtLink
        v-if="group.composer"
        :to="composerPath(group.composer.name)"
        :prefetch="false"
        rel="nofollow"
        class="inline-flex min-h-6 min-w-0 max-w-full items-center justify-self-start self-start py-0.5 font-semibold leading-5 text-gray-600 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:font-normal [@media(min-width:640px)_and_(pointer:coarse)]:min-h-11"
      >{{ group.composer.name }}</NuxtLink>
      <ul
        v-if="group.works.length"
        class="min-w-0 list-none sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-3"
        :class="group.composer ? 'pl-3 sm:pl-0' : 'sm:col-start-2'"
      >
        <li v-for="(work, index) in group.works" :key="work.id" class="min-w-0 max-w-full">
          <span v-if="index" aria-hidden="true" class="mr-3 hidden text-gray-400 sm:inline">·</span>
          <NuxtLink
            :to="workPath(work.id)"
            :prefetch="false"
            rel="nofollow"
            class="inline-flex min-h-6 max-w-full items-center py-0.5 leading-5 text-gray-800 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [@media(min-width:640px)_and_(pointer:coarse)]:min-h-11"
            :aria-label="t('Find concerts featuring {work}', { work: work.composer ? `${work.composer.name}: ${work.title}` : work.title })"
          >{{ work.title }}</NuxtLink>
          <span v-if="matches(work)" class="ml-2 text-xs text-gray-600">{{ t('Matches filter') }}</span>
        </li>
      </ul>
    </li>
  </ul>
</template>

<script setup>
import { querySelections } from '../../shared/utils/concert-query.js'
import { concertWorkLocation, concertComposerLocation } from '../utils/concert-discovery.js'

const props = defineProps({
  works: { type: Array, default: () => [] },
  composers: { type: Array, default: () => [] },
})
const { t } = useConcertText()
const route = useRoute()
const selectedWorks = computed(() => new Set(querySelections(route.query.works).map(Number)))
const matches = work => selectedWorks.value.has(Number(work.id))
const groups = computed(() => {
  const grouped = new Map()
  for (const work of props.works) {
    const key = work.composer?.id == null ? 'unknown' : String(work.composer.id)
    if (!grouped.has(key)) grouped.set(key, { key, composer: work.composer, works: [] })
    grouped.get(key).works.push(work)
  }
  for (const composer of props.composers) {
    const key = String(composer.id)
    if (!grouped.has(key)) grouped.set(key, { key, composer, works: [] })
  }
  return [...grouped.values()].sort((a, b) => (a.composer?.name || '').localeCompare(b.composer?.name || ''))
})
const workPath = id => concertWorkLocation(route, id)
const composerPath = name => concertComposerLocation(route, name)
</script>

<style scoped>
.concert-programme {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-gray-200);
}
.concert-programme > li { column-gap: 1.5rem; }
.concert-programme > li > a { color: var(--color-gray-700); }
.concert-programme > li > ul a { color: var(--color-gray-900); }
@media (max-width: 639px) {
  .concert-programme { margin-top: 0; padding-top: 0; border-top: 0; }
}
</style>
