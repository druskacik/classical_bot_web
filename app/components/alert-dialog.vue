<template>
  <dialog ref="dialog" class="alert-dialog m-auto w-[calc(100%-2rem)] max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white p-0 text-gray-900" :aria-labelledby="`${id}-title`" @cancel.prevent="close" @close="restoreScroll">
    <div class="p-5 sm:p-8">
      <header class="mb-6 flex items-start justify-between gap-4">
        <h2 :id="`${id}-title`" ref="heading" tabindex="-1" class="font-serif text-2xl sm:text-3xl">{{ editing ? 'Editing your alert' : managed ? 'Creating a new alert' : 'New concert alert' }}</h2>
        <button type="button" :disabled="busy" aria-label="Close alert dialog" class="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center hover:bg-gray-50 disabled:opacity-50" @click="close"><UIcon name="i-lucide-x" class="size-5" /></button>
      </header>
      <template v-if="!success">
        <p v-if="filterError" ref="filterErrorElement" role="alert" tabindex="-1" class="mb-4 text-sm text-red-700">Choose at least one filter before saving an alert.</p>
        <!-- CityRadius owns a small form; keep the filters outside the save form. -->
        <fieldset :disabled="busy" class="min-w-0">
          <legend class="sr-only">Alert criteria</legend>
          <ConcertFilters :country="draft.country || null" :city="draft.city || null" :radius="Number(draft.radius) || 0" :area-query="draft"
            :date-from="draft.dateFrom || null" :date-to="draft.dateTo || null" :date-preset="draft.datePreset || null"
            :composers="selections(draft.composers)" :works="selections(draft.works)"
            :countries="countries" :countries-loading="countriesLoading" :countries-error="countriesError"
            @update="update" @city-radius="changeCityRadius" @clear="draft = {}" @retry-countries="loadCountries" />
        </fieldset>
        <div class="mt-6">
          <p class="break-words text-sm text-gray-700" aria-live="polite">{{ summary || (previewError ? 'Your search could not be loaded.' : 'Loading your search…') }}</p>
          <p v-if="previewError" role="alert" class="mt-2 text-sm text-red-700">{{ previewError }}</p>
          <button v-if="previewError" type="button" class="min-h-11 text-primary hover:underline" @click="preview">Try again</button>
          <p class="mt-2 text-sm text-gray-600">One daily email with new matches across all your alerts. Unsubscribe anytime.</p>
        </div>
        <form class="mt-5" :aria-busy="busy" @submit.prevent="submit">
          <p v-if="managed" class="break-all text-sm text-gray-700">Saving for {{ subscriberEmail }}</p>
          <div v-else>
            <label :for="`${id}-email`" class="block text-sm text-gray-800">Email address</label>
            <input :id="`${id}-email`" v-model="email" :disabled="busy" type="email" autocomplete="email" required maxlength="254" class="mt-1 min-h-11 w-full border-0 border-b border-gray-400 bg-white text-base text-gray-950 outline-none focus:border-b-2 focus:border-primary focus:ring-0" />
            <div class="hidden" aria-hidden="true"><label :for="`${id}-website`">Website</label><input :id="`${id}-website`" v-model="website" tabindex="-1" autocomplete="off" /></div>
          </div>
          <p v-if="error" role="alert" class="mt-3 text-sm text-red-700">{{ error }}</p>
          <footer class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
            <button type="submit" :disabled="busy || !summary || previewPending" @click="validateFilters" class="min-h-11 bg-gray-900 px-5 text-sm text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50">{{ busy ? 'Saving…' : editing ? 'Save alert' : 'Create alert' }}</button>
            <button type="button" :disabled="busy" class="min-h-11 text-sm text-gray-700 hover:underline disabled:opacity-50" @click="close">Cancel</button>
          </footer>
        </form>
      </template>
      <template v-else>
        <p ref="successMessage" role="status" tabindex="-1" class="text-gray-900">Check your inbox for your alert link. Your other alerts stay unchanged.</p>
        <button type="button" class="mt-6 min-h-11 bg-gray-900 px-5 text-sm text-white hover:bg-gray-700" @click="close">Done</button>
      </template>
    </div>
  </dialog>
</template>

<script setup>
import { alertDraft, updateAlertDraft, alertCityRadius, hasAlertFilter } from '../utils/alert-draft.js'
import { querySelections as selections } from '../../layers/concerts/shared/utils/concert-query.js'

const props = defineProps({
  initialCriteria: { type: Object, default: () => ({}) },
  token: { type: String, default: '' },
  subscriberEmail: { type: String, default: '' },
  alertId: { type: [String, Number], default: null },
})
const emit = defineEmits(['close', 'saved'])
const id = useId()
const dialog = ref(null), heading = ref(null), successMessage = ref(null)
const draft = ref(alertDraft(props.initialCriteria))
const email = ref(''), website = ref(''), summary = ref(''), error = ref(''), previewError = ref('')
const filterError = ref(false), filterErrorElement = ref(null)
const busy = ref(false), success = ref(false), previewPending = ref(true)
const countries = ref([]), countriesLoading = ref(false), countriesError = ref(false)
const managed = computed(() => Boolean(props.token))
const editing = computed(() => managed.value && props.alertId != null)
let version = 0, countryVersion = 0, timer, opener, previousOverflow
let disposed = false
const message = e => e.data?.statusMessage || 'Your alert could not be saved. Please try again.'
const update = ({ key, value, changes }) => { draft.value = updateAlertDraft(draft.value, changes || { [key]: value }) }
const changeCityRadius = value => { draft.value = alertCityRadius(draft.value, value) }
async function loadCountries() {
  const current = ++countryVersion
  countriesLoading.value = true; countriesError.value = false
  try {
    const { country, city, datePreset, ...context } = draft.value
    const result = await $fetch('/api/get-concert-filter-options', { params: { ...context, ...(Number(context.radius) > 0 ? { city } : {}), type: 'country', selected: country } })
    if (current === countryVersion) countries.value = result.items.map(item => ({ code: item.value, name: item.label, count: item.count }))
  } catch { if (current === countryVersion) countriesError.value = true }
  finally { if (current === countryVersion) countriesLoading.value = false }
}
async function preview() {
  clearTimeout(timer)
  const current = ++version
  summary.value = ''; previewError.value = ''; previewPending.value = true
  try {
    const result = await $fetch('/api/alerts/preview', { method: 'POST', body: { criteria: draft.value } })
    if (current === version) summary.value = result.summary
  } catch (e) { if (current === version) previewError.value = message(e) }
  finally { if (current === version) previewPending.value = false }
}
watch(draft, () => {
  if (hasAlertFilter(draft.value)) filterError.value = false
  ++version; ++countryVersion
  summary.value = ''; previewError.value = ''; error.value = ''; previewPending.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { preview(); loadCountries() }, 250)
}, { deep: true, flush: 'sync' })
function restoreScroll() {
  if (previousOverflow !== undefined) { document.documentElement.style.overflow = previousOverflow; previousOverflow = undefined }
}
function close() {
  if (busy.value) return
  dialog.value?.close()
  restoreScroll()
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  emit('close')
}
onMounted(() => {
  opener = document.activeElement
  previousOverflow = document.documentElement.style.overflow
  document.documentElement.style.overflow = 'hidden'
  dialog.value.showModal()
  heading.value?.focus()
  preview(); loadCountries()
})
onBeforeUnmount(() => {
  disposed = true; ++version; ++countryVersion; clearTimeout(timer)
  dialog.value?.close(); restoreScroll()
})
function validateFilters(event) {
  if (hasAlertFilter(draft.value)) return true
  event?.preventDefault()
  filterError.value = true
  nextTick(() => filterErrorElement.value?.focus())
  return false
}
async function submit() {
  if (busy.value || previewPending.value || !summary.value || !validateFilters()) return
  busy.value = true; error.value = ''
  try {
    const result = await $fetch(`/api/alerts/${managed.value ? (editing.value ? 'update' : 'create') : 'request'}`, {
      method: 'POST', body: { criteria: draft.value, email: email.value, website: website.value, token: managed.value ? props.token : undefined, alertId: editing.value ? props.alertId : undefined },
    })
    if (disposed) return
    if (managed.value) {
      busy.value = false
      close()
      emit('saved', { ...result, message: result.duplicate ? 'You already have this alert.' : editing.value ? 'Alert updated.' : 'Alert saved. New matches will be included in your daily email.' })
    } else {
      success.value = true
      await nextTick(); successMessage.value?.focus()
    }
  } catch (e) { if (!disposed) error.value = message(e) }
  finally { busy.value = false }
}
</script>

<style scoped>
.alert-dialog { --ui-primary: var(--color-primary-600); border: 0; color-scheme: light; caret-color: var(--ui-primary); scrollbar-color: var(--color-gray-400) white; }
.alert-dialog::backdrop { background: rgb(17 24 39 / 0.4); }
.alert-dialog :deep(button:not(:disabled)), .alert-dialog :deep(select:not(:disabled)) { cursor: pointer; }
.alert-dialog :deep(button:focus-visible), .alert-dialog :deep(a:focus-visible) { outline: 2px solid var(--ui-primary); outline-offset: 3px; }
.alert-dialog :deep(.music-fields) { display: grid; }
.alert-dialog :deep(button[aria-controls][aria-expanded]) { display: none; }
.alert-dialog :deep([role='listbox']) { max-height: 12rem; }
</style>
