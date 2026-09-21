<template>
  <ConcertListPage title="Classical music concerts around the world">
    <template #alerts="{ criteria }"><AlertSignup :criteria="criteria" /></template>
  </ConcertListPage>
</template>

<script setup>
useConcertListSeo({
  title: 'ClassicalBot — Classical music concerts around the world',
  description: 'Discover upcoming classical music concerts around the world.',
  canonicalPath: '/',
})
</script>
