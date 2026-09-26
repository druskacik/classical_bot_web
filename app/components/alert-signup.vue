<template>
  <section v-if="enabled" class="text-sm" aria-label="Concert email alerts">
    <p v-if="criteria.bounds" class="text-gray-600">Remove the map area to create an email alert.</p>
    <button v-else type="button" class="min-h-11 cursor-pointer text-primary underline-offset-4 hover:underline focus-visible:outline-2" aria-haspopup="dialog" @click="opened = true">Email me new matches</button>
    <AlertDialog v-if="opened" :initial-criteria="criteria" @close="opened = false" />
  </section>
</template>
<script setup>
defineProps({ criteria: { type: Object, required: true } })
const config = useRuntimeConfig()
const enabled = computed(() => String(config.public.alertsEnabled) === 'true')
const opened = ref(false)
</script>
