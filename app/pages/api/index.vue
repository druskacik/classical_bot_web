<template>
  <EditorialArticle title="API">
    <p>ClassicalBot offers an API for global classical music concerts data. The basic functionality is future events search, with filters including: organisation website, country, city, performer and venue.</p>
    <p><NuxtLink to="/api/docs" class="text-primary-700 underline underline-offset-4">Read the documentation</NuxtLink> for examples, parameters and response fields.</p>
    <p>We also offer custom API solutions in the event data space for enterprise customers.</p>
    <p>If you are interested, please contact us.</p>
    <NuxtLink to="/contact" class="mt-8 inline-flex min-h-11 items-center bg-primary-700 px-5 py-2.5 text-white hover:bg-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">
      Contact us
    </NuxtLink>
  </EditorialArticle>
</template>

<script setup>
useSeoMeta({
  title: 'API — ClassicalBot',
  description: 'ClassicalBot offers an API for global classical concerts data.',
})
</script>
