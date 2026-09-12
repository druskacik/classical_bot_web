<template>
  <EditorialArticle title="Blog">
    <ul v-if="posts?.length" class="divide-y divide-gray-200">
      <li v-for="post in posts" :key="post.path" class="py-6 first:pt-0">
        <article>
          <h2 class="!mt-0">
            <NuxtLink
              :to="post.path"
              class="hover:text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
            >{{ post.title }}</NuxtLink>
          </h2>
          <time :datetime="post.date" class="text-sm text-gray-600">{{ formatBlogDate(post.date) }}</time>
          <p>{{ post.description }}</p>
        </article>
      </li>
    </ul>
    <p v-else>No posts yet.</p>
  </EditorialArticle>
</template>

<script setup lang="ts">
const { data: posts } = await useAsyncData('blog', () =>
  queryCollection('blog').order('date', 'DESC').select('path', 'title', 'description', 'date').all(),
)

useSeoMeta({
  title: 'Blog — ClassicalBot',
  description: 'Notes on building ClassicalBot and discovering classical-music concerts worldwide.',
})
</script>
