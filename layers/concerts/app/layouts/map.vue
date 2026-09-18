<template>
  <div class="map-shell">
    <TheNavbar />
    <slot />
    <TheFooter class="map-footer" />
  </div>
</template>

<style scoped>
/* Keep the centre row bounded: min-content here measures the entire concert list. */
.map-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  min-width: 0;
  height: 100dvh;
  min-height: 0;
  overflow: clip;
}
.map-shell > * { min-width: 0; }
.map-footer { padding-block: .5rem; }
</style>
