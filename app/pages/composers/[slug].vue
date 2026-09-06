<template>
  <main class="composer-surface mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <nav aria-label="Breadcrumb"><NuxtLink to="/composers" class="composer-action inline-flex min-h-11 items-center gap-2 text-sm"><UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />Composers</NuxtLink></nav>
    <div v-if="status === 'pending'" class="mt-8" role="status"><UProgress animation="swing" /><span class="sr-only">Loading composer</span></div>
    <div v-else-if="error" class="mt-8" role="alert">
      <h1 class="font-serif text-3xl">Composer could not be loaded</h1>
      <button class="composer-action mt-3 min-h-11 cursor-pointer" @click="refresh()">Try again</button>
    </div>
    <template v-else-if="composer">
      <header class="mt-5 border-b border-gray-200 pb-7 sm:mt-7 sm:pb-9">
        <h1 class="max-w-4xl text-balance font-serif text-4xl leading-tight text-gray-950 sm:text-5xl lg:text-6xl">{{ composer.name }}</h1>
        <div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1">
          <p class="text-gray-600">{{ formatCount(composer.concertCount) }} upcoming {{ composer.concertCount === 1 ? 'concert' : 'concerts' }} worldwide</p>
          <NuxtLink :to="composerConcertLocation(composer.name)" rel="nofollow" :prefetch="false" class="composer-action inline-flex min-h-11 items-center gap-2">Browse concerts<UIcon name="i-lucide-arrow-right" class="size-4" aria-hidden="true" /></NuxtLink>
        </div>
      </header>
      <div class="mt-8 grid items-start gap-10 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14">
        <ComposerPlayer :key="composer.id" :composer="composer" />
        <section aria-labelledby="works-heading" class="min-w-0">
          <h2 id="works-heading" class="font-serif text-2xl leading-snug text-gray-950 sm:text-3xl">Most played in upcoming concerts</h2>
          <p class="mt-3 text-sm leading-6 text-gray-600">Ranked by upcoming concerts listed on ClassicalBot. Choose a work to find a performance.</p>
          <ol v-if="composer.works.length" class="mt-6 border-b border-gray-200">
            <li v-for="(work, index) in composer.works" :key="work.id" class="border-t border-gray-200">
              <NuxtLink :to="workLocation(work.id)" rel="nofollow" :prefetch="false" class="composer-work-link group grid min-h-20 grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 py-5 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:gap-x-4">
                <span class="pt-0.5 text-sm tabular-nums text-gray-500" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="min-w-0">
                  <span class="block text-base leading-6 text-gray-950 group-hover:underline">{{ work.title }}</span>
                  <span v-if="work.catalogue" class="mt-1 block text-sm text-gray-600">{{ work.catalogue }}</span>
                </span>
                <span class="col-start-2 mt-2 inline-flex items-center gap-2 text-sm tabular-nums text-primary sm:col-start-auto sm:mt-0 sm:self-start sm:pt-0.5">
                  {{ formatCount(work.concertCount) }} {{ work.concertCount === 1 ? 'concert' : 'concerts' }}
                  <UIcon name="i-lucide-arrow-up-right" class="size-4 shrink-0" aria-hidden="true" />
                </span>
              </NuxtLink>
            </li>
          </ol>
          <p v-else class="mt-6 border-t border-gray-200 py-6 text-gray-600">No upcoming performances of individual works are listed yet. You can still explore the playlist or browse this composer’s concerts.</p>
        </section>
      </div>
      <section v-if="composer.related.length" aria-labelledby="more-composers" class="mt-16 border-t border-gray-200 pt-8 sm:mt-20">
        <div class="mb-7 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="more-composers" class="font-serif text-3xl text-gray-950">Keep exploring</h2>
          <NuxtLink to="/composers" class="composer-action inline-flex min-h-11 items-center">All composers</NuxtLink>
        </div>
        <ComposerGallery :composers="composer.related" :heading-level="3" />
      </section>
    </template>
  </main>
</template>

<script setup>
import { composerIdFromSlug, workLocation, composerConcertLocation } from '#shared/utils/composers.js'
import { classicalBotSite } from '../../../site.config.js'
definePageMeta({ key: route => route.path })
const route = useRoute()
const id = composerIdFromSlug(route.params.slug)
if (!id) throw createError({ statusCode: 404, statusMessage: 'Composer not found' })
const { data: composer, status, error, refresh } = await useAsyncData(`composer:${id}`, () => $fetch(`/api/composers/${id}`))
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Composer not found' })
if (import.meta.server && error.value) setResponseStatus(useRequestEvent(), 503)
if (composer.value && route.path !== composer.value.path) await navigateTo({ path: composer.value.path, query: route.query }, { redirectCode: 301, replace: true })
const formatCount = count => new Intl.NumberFormat('en-GB').format(count)
const canonical = computed(() => `${classicalBotSite.origin}${composer.value?.path || route.path}`)
useSeoMeta({
  title: () => `${composer.value?.name || 'Composer'} — Works & concerts — ClassicalBot`,
  description: () => `Explore ${composer.value?.name || 'this composer'}’s most played upcoming works, listen on Spotify, and find live performances worldwide.`,
  ogTitle: () => `${composer.value?.name || 'Composer'} — ClassicalBot`,
  ogDescription: 'Listen, explore the repertoire, and find your next concert.',
  ogType: 'website', ogUrl: () => canonical.value,
  ogImage: () => composer.value?.cover ? `${classicalBotSite.origin}${composer.value.cover}-800.webp` : undefined,
  robots: () => error.value ? 'noindex, follow' : 'index, follow',
})
useHead(() => ({ link: [{ rel: 'canonical', href: canonical.value }] }))
</script>
