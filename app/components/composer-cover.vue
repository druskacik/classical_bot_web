<template>
  <img v-if="composer.cover" :src="`${composer.cover}-800.webp`"
    :srcset="`${composer.cover}-400.webp 400w, ${composer.cover}-800.webp 800w`"
    :sizes="sizes" width="800" height="800" :loading="eager ? 'eager' : 'lazy'"
    alt="" class="composer-cover aspect-square w-full object-contain" />
  <div v-else class="composer-cover flex aspect-square items-center justify-center bg-gray-50 p-6 text-center font-serif text-3xl text-gray-900" aria-hidden="true">
    {{ composer.name }}
  </div>
</template>

<script setup>
defineProps({
  composer: { type: Object, required: true },
  eager: { type: Boolean, default: false },
  sizes: { type: String, default: '(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw' },
})
</script>
