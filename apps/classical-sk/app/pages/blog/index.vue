<template>
  <main class="container mx-auto px-4 py-8">
    <div class="mx-auto max-w-3xl">
      <h1 class="font-serif text-3xl text-gray-950">Blog</h1>
      <ul class="mt-8 space-y-6">
        <li v-for="article in articles" :key="article.id">
          <NuxtLink :to="`/blog${article.path}`" class="inline-flex min-h-11 items-center font-serif text-xl text-primary hover:underline">{{ article.title }}</NuxtLink>
        </li>
      </ul>
    </div>
  </main>
</template>
<script setup>
const { data: articles } = await useAsyncData('sk-articles', () => queryCollection('articles').order('date', 'DESC').all())
useSeoMeta({ title: 'Blog – classical.sk' })
useHead({ link: [{ rel: 'canonical', href: 'https://classical.sk/blog' }] })
</script>
