<template>
  <UApp :locale="sk">
    <NuxtLoadingIndicator color="var(--ui-primary)" :height="2" />
    <NuxtLayout><NuxtPage /></NuxtLayout>
  </UApp>
</template>
<script setup>
import { sk } from '@nuxt/ui/locale'
</script>
