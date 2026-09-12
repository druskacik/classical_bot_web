<template>
  <EditorialArticle v-if="page" :title="page.title">
    <template #metadata>
      <div class="mt-5 text-center text-sm text-gray-600">
        <time :datetime="page.date">{{ formatBlogDate(page.date) }}</time>
      </div>
    </template>
    <ContentRenderer :value="page" class="blog-body" />
  </EditorialArticle>
</template>

<script setup lang="ts">
const route = useRoute()
const { data: page } = await useAsyncData(`blog-${route.params.slug}`, () =>
  queryCollection('blog').path(`/blog/${route.params.slug}`).first(),
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Blog post not found' })
}

useSeoMeta({
  title: () => `${page.value?.title ?? 'Blog'} — ClassicalBot`,
  description: () => page.value?.description,
  ogType: 'article',
  articlePublishedTime: () => page.value?.date,
})
</script>

<style scoped>
.blog-body {
  overflow-wrap: anywhere;
}

.blog-body :deep(p:has(img):has(+ .photo-credit)) {
  margin-bottom: 0.25rem;
}

.blog-body :deep(.photo-credit) {
  display: block;
  line-height: 1.5;
}

.blog-body :deep(ol) {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin-block: 1rem;
}

.blog-body :deep(li) {
  padding-left: 0.25rem;
  margin-block: 0.5rem;
}
</style>
