<template>
  <ConcertListPage
    title="Classical music concerts around the world"
    seo-title="ClassicalBot — Classical music concerts around the world"
    seo-description="Discover upcoming classical music concerts around the world."
  >
    <template #alerts="{ criteria }"><AlertSignup :criteria="criteria" /></template>
  </ConcertListPage>
</template>
