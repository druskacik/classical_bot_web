<template>
  <main class="container mx-auto px-4 py-8">
    <article class="mx-auto max-w-3xl">
      <h1 class="font-serif text-3xl text-gray-950">{{ page.title }}</h1>
      <p v-if="page.date" class="mt-3 text-sm text-gray-500">{{ formatDate(page.date) }}</p>
      <ContentRenderer :value="page" class="article-content mt-8" />
    </article>
  </main>
</template>
<script setup>
const route = useRoute()
const { data: page } = await useAsyncData(`article:${route.params.slug}`, () => queryCollection('articles').path(`/${route.params.slug}`).first())
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Článok sa nepodarilo nájsť' })
const formatDate = value => new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
useSeoMeta({ title: () => `${page.value.title} – classical.sk` })
useHead({ link: [{ rel: 'canonical', href: `https://classical.sk/blog/${encodeURIComponent(String(route.params.slug))}` }] })
</script>
<style scoped>
.article-content { color: var(--color-gray-700); line-height: 1.75; }
.article-content :deep(p) { margin-top: 1rem; }
.article-content :deep(h2) { margin: 2rem 0 1rem; font-family: var(--font-serif); font-size: 1.5rem; }
</style>
