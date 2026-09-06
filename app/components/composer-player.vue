<template>
  <section aria-label="Spotify playlist" class="composer-listening">
    <div class="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-5 sm:grid-cols-[10rem_minmax(0,1fr)] lg:block">
      <a :href="composer.playlist.url" target="_blank" rel="noopener noreferrer" :aria-label="`Open ${composer.name} playlist on Spotify (opens in a new tab)`">
        <ComposerCover :composer="composer" eager sizes="(min-width: 1024px) 352px, (min-width: 640px) 160px, 112px" />
      </a>
      <div class="min-w-0 lg:mt-5">
        <h2 class="font-serif text-xl text-gray-950">Listen on Spotify</h2>
        <p class="mt-1 text-sm text-gray-600">{{ composer.playlist.season }} · {{ composer.playlist.trackCount }} tracks</p>
        <a :href="composer.playlist.url" target="_blank" rel="noopener noreferrer" class="composer-action mt-2 inline-flex min-h-11 items-center gap-2 text-sm">
          Open playlist <UIcon name="i-lucide-arrow-up-right" class="size-4" aria-hidden="true" />
          <span class="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
    <p class="mt-4 text-sm leading-6 text-gray-600">A listening selection, including individual movements and other highlights. Selections may differ from the live ranking.</p>
    <div class="mt-4 min-h-[152px]">
      <iframe v-if="playerLoaded" :src="`https://open.spotify.com/embed/playlist/${composer.playlist.id}`"
        :title="`${composer.name} Spotify playlist`" width="100%" height="152" class="block border-0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen />
      <div v-else class="flex min-h-[152px] flex-col items-start justify-center border-y border-gray-200 py-4">
        <button type="button" class="composer-action inline-flex min-h-11 cursor-pointer items-center gap-2" @click="playerLoaded = true">
          <UIcon name="i-lucide-circle-play" class="size-5" aria-hidden="true" /> Load player
        </button>
        <p class="mt-1 text-xs leading-5 text-gray-600">Loads Spotify’s embedded player.</p>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({ composer: { type: Object, required: true } })
const playerLoaded = ref(false)
</script>
