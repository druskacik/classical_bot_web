<template>
  <main class="mx-auto max-w-3xl px-4 py-16 text-center">
    <h1 class="font-serif text-3xl text-gray-950">{{ error?.statusCode === 404 ? 'Stránka sa nenašla' : 'Stránku sa nepodarilo načítať' }}</h1>
    <p class="mt-4 text-gray-600">{{ error?.statusCode === 404 ? 'Skontrolujte adresu alebo sa vráťte na prehľad koncertov.' : 'Skúste to, prosím, znova.' }}</p>
    <button class="mt-6 min-h-11 text-primary underline" @click="clearError({ redirect: '/' })">Prehľad koncertov</button>
  </main>
</template>
<script setup>
defineProps({ error: Object })
useHead({ htmlAttrs: { lang: 'sk' }, meta: [{ name: 'robots', content: 'noindex, follow' }] })
</script>
