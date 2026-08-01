<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<style>
#app {
font-family: 'Lato', sans-serif;
}
</style>

<script setup lang="ts">
useHead({
  htmlAttrs: {
    lang: 'en',
  },
})
</script>
