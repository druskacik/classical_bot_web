<template>
  <main class="container mx-auto px-4 py-8">
    <article v-if="page" class="mx-auto max-w-3xl">
      <h1 class="text-center font-serif text-3xl">{{ page.title }}</h1>

      <div class="about-rule my-8" aria-hidden="true">
        <span />
      </div>

      <ContentRenderer :value="page" class="about-content" />
    </article>
  </main>
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

<style scoped>
.about-rule {
  display: flex;
  align-items: center;
  height: 1px;
  background: var(--color-gray-200);
}

.about-rule span {
  display: block;
  width: 3.5rem;
  height: 3px;
  background: var(--color-primary-600);
}

.about-content {
  color: var(--color-gray-700);
  line-height: 1.75;
}

.about-content :deep(h2) {
  margin: 2rem 0 1rem;
  color: var(--color-gray-900);
  font-family: var(--font-serif);
  font-size: 1.5rem;
  font-weight: 400;
}

.about-content :deep(h2:first-child) {
  margin-top: 0;
}

.about-content :deep(p) {
  margin-top: 1rem;
}

</style>
