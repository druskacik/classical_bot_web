<template>
  <div class="map-shell">
    <TheNavbar />
    <slot />
  </div>
</template>

<style scoped>
/* Keep the content row bounded: min-content here measures the entire concert list. */
.map-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  height: 100dvh;
  min-height: 0;
  overflow: clip;
}
.map-shell > * { min-width: 0; }
</style>
