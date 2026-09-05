<template>
  <span class="inline-flex items-center gap-2.5 text-gray-900">
    <BrandMark class="size-8 shrink-0" />
    <span class="font-serif text-[1.35rem] leading-none tracking-[-0.025em]">{{ name }}</span>
  </span>
</template>

<script setup>
defineProps({ name: { type: String, default: 'ClassicalBot' } })
</script>
