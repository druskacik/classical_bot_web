<template>
  <div v-if="preview.names.length || preview.rows.length" class="mt-2 text-xs leading-relaxed">
    <p v-if="preview.names.length" class="text-gray-700">{{ preview.names.join(' · ') }}</p>
    <dl v-else class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1">
      <template v-for="(row, index) in preview.rows" :key="index">
        <dt :class="!row.composer && 'sr-only'" class="text-gray-700">{{ row.composer || t('Work') }}</dt>
        <dd :class="!row.composer && 'col-span-2'" class="min-w-0 text-gray-600">{{ row.work }}</dd>
      </template>
    </dl>
    <a v-if="preview.omitted" :href="url" target="_blank" rel="noopener noreferrer" class="mt-1 inline-flex min-h-6 items-center text-primary underline-offset-4 hover:underline">
      {{ t('Full programme') }}<span class="sr-only"> ({{ t('Opens in a new tab') }})</span>
    </a>
  </div>
</template>
<script setup>
import { mapProgramme } from '../utils/map-programme.js'
const props = defineProps({ composers: { type: Array, default: () => [] }, works: { type: Array, default: () => [] }, url: { type: String, required: true } })
const { t } = useConcertText()
const preview = computed(() => mapProgramme(props.composers, props.works))
</script>
