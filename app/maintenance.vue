<script setup lang="ts">
useHead({ title: 'Scheduled maintenance · ClassicalBot' })

function retry() {
  window.location.reload()
}
</script>

<template>
  <div class="flex min-h-svh flex-col bg-white text-gray-900 selection:bg-gray-100">
    <header class="mx-auto w-[calc(100%_-_3rem)] max-w-[68rem] border-b border-gray-200 py-6 sm:py-8">
      <BrandLogo />
    </header>
    <main class="mx-auto flex w-[calc(100%_-_3rem)] max-w-[68rem] flex-1 items-center pt-16 pb-24 sm:pt-20 sm:pb-32">
      <section class="max-w-xl" aria-labelledby="maintenance-title">
        <h1 id="maintenance-title" class="mb-5 font-serif text-3xl leading-tight tracking-tight text-balance sm:text-5xl">
          We’ll be back soon
        </h1>
        <p class="text-base leading-relaxed text-gray-600">
          ClassicalBot is temporarily unavailable while we carry out scheduled maintenance. Please try again shortly.
        </p>
        <button
          type="button"
          class="mt-8 cursor-pointer rounded py-2.5 text-blue-600 underline underline-offset-4 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
          @click="retry"
        >
          Try again
        </button>
        <noscript><p class="mt-4 text-gray-600">Reload this page to try again.</p></noscript>
      </section>
    </main>
  </div>
</template>
