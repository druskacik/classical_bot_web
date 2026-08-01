<template>
  <div class="flex flex-col min-h-screen">
    <the-navbar />
    <slot />
    <the-footer class="mt-auto" />
  </div>
</template>
  
<style>
#app {
  font-family: 'Lato', sans-serif;
}
</style>