<template>
  <div v-if="works.length" class="text-sm [overflow-wrap:anywhere]">
    <div>
      <div>
        <div v-for="group in groups" :key="group.key" class="grid gap-x-4 border-b border-gray-100 py-1.5 last:border-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <NuxtLink
            v-if="group.composer"
            :to="composerPath(group.composer.name)"
            :prefetch="false"
            rel="nofollow"
            class="min-h-6 justify-self-start self-start py-0.5 leading-5 text-gray-600 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [@media(pointer:coarse)]:min-h-11"
          >{{ group.composer.name }}</NuxtLink>
          <ul v-if="group.works.length" class="flex min-w-0 list-none flex-wrap items-baseline gap-x-3" :class="!group.composer && 'sm:col-start-2'">
            <li v-for="(work, index) in group.works" :key="work.id" class="max-w-full">
              <span v-if="index" aria-hidden="true" class="mr-3 text-gray-400">·</span>
              <NuxtLink
                :to="workPath(work.id)"
                :prefetch="false"
                rel="nofollow"
                class="inline-flex min-h-6 max-w-full items-center py-0.5 leading-5 text-gray-800 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [@media(pointer:coarse)]:min-h-11"
                :aria-label="t('Find concerts featuring {work}', { work: work.composer ? `${work.composer.name}: ${work.title}` : work.title })"
              >{{ work.title }}</NuxtLink>
              <span v-if="matches(work)" class="ml-2 text-xs text-gray-600">{{ t('Matches filter') }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { concertWorkLocation, concertComposerLocation } from '../utils/concert-discovery.js'

const props = defineProps({
  works: { type: Array, default: () => [] },
  composers: { type: Array, default: () => [] },
})
const { t } = useConcertText()
const route = useRoute()
const selectedWorks = computed(() => {
  const value = Array.isArray(route.query.works) ? route.query.works[0] : route.query.works
  return new Set(typeof value === 'string' ? value.split(',').map(Number) : [])
})
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
