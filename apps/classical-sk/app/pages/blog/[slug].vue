<template>
  <EditorialArticle :title="page.title">
    <template #metadata>
      <p v-if="page.date" class="mt-3 text-center text-sm text-gray-500">{{ formatDate(page.date) }}</p>
    </template>
    <ContentRenderer :value="page" />
  </EditorialArticle>
</template>
<script setup>
const route = useRoute()
const { data: page } = await useAsyncData(`article:${route.params.slug}`, () => queryCollection('articles').path(`/${route.params.slug}`).first())
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Článok sa nepodarilo nájsť' })
const formatDate = value => new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
useSeoMeta({ title: () => `${page.value.title} – classical.sk` })
useHead({ link: [{ rel: 'canonical', href: `https://classical.sk/blog/${encodeURIComponent(String(route.params.slug))}` }] })
</script>
