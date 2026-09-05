<template>
  <EditorialArticle v-if="page" :title="page.title">
    <ContentRenderer :value="page" />
  </EditorialArticle>
</template>

<script setup lang="ts">
const { data: page } = await useAsyncData('about', () => {
  return queryCollection('content').path('/about').first()
})

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'About page not found' })
}

useSeoMeta({
  title: () => `${page.value?.title ?? 'About'} — ClassicalBot`,
  description: () => page.value?.description,
})
</script>
