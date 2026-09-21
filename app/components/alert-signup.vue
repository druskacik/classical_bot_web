<template>
  <section v-if="enabled" class="my-3 text-sm" aria-label="Concert email alerts">
    <p v-if="criteria.bounds" class="text-gray-600">Remove the map area to create an email alert.</p>
    <template v-else>
      <button v-if="!opened" type="button" class="min-h-11 cursor-pointer text-primary underline-offset-4 hover:underline focus-visible:outline-2" @click="open">{{ editing ? 'Save these alert criteria' : 'Email me new matches' }}</button>
      <form v-else class="max-w-xl border-y border-gray-200 py-5" @submit.prevent="submit">
        <h2 class="font-serif text-xl text-gray-950">{{ editing ? 'Editing your alert' : managed ? 'Creating a new alert' : 'New concert alert' }}</h2>
        <p class="mt-2 text-gray-700" aria-live="polite">{{ summary || (error ? 'Your search could not be loaded.' : 'Loading your search…') }}</p>
        <p class="mt-2 text-gray-600">One daily email with new matches across all your alerts. Unsubscribe anytime.</p>
        <template v-if="!success">
          <p v-if="managed" class="mt-4 break-all text-gray-700">Saving for {{ context.email }}</p>
          <div v-else class="mt-4">
            <label for="alert-email" class="block text-gray-800">Email address</label>
            <input id="alert-email" v-model="email" type="email" autocomplete="email" required maxlength="254" class="mt-1 min-h-11 w-full border border-gray-400 bg-white px-3 text-base text-gray-950 focus:border-primary focus:outline-2 focus:outline-primary" />
            <div class="hidden" aria-hidden="true"><label for="alert-website">Website</label><input id="alert-website" v-model="website" tabindex="-1" autocomplete="off" /></div>
          </div>
          <p v-if="error" role="alert" class="mt-3 text-red-700">{{ error }}</p>
          <div class="mt-4 flex flex-wrap items-center gap-5">
            <button type="submit" :disabled="busy || !summary" class="min-h-11 cursor-pointer bg-gray-900 px-4 text-white hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60">{{ busy ? 'Saving…' : editing ? 'Save alert' : 'Create alert' }}</button>
            <button v-if="!summary && !busy" type="button" class="min-h-11 cursor-pointer text-primary hover:underline" @click="preview">Try again</button>
            <button type="button" class="min-h-11 cursor-pointer text-gray-700 hover:underline" @click="close">Cancel</button>
          </div>
        </template>
        <p v-else role="status" class="mt-4 text-gray-900">Check your inbox for your alert link. Your other alerts stay unchanged.</p>
      </form>
    </template>
  </section>
</template>
<script setup>
const props = defineProps({ criteria: { type: Object, required: true } })
const config = useRuntimeConfig()
// Match URL query serialization, including numeric IDs inherited from city pages.
const query = computed(() => Object.fromEntries(Object.entries(props.criteria).filter(([, value]) => value != null && value !== '').map(([key, value]) => [key, String(value)])))
const enabled = computed(() => String(config.public.alertsSignupEnabled) === 'true')
const opened = ref(false), busy = ref(false), success = ref(false), email = ref(''), website = ref(''), summary = ref(''), error = ref(''), access = ref(''), context = ref(null)
const managed = computed(() => Boolean(access.value && context.value))
const editing = computed(() => managed.value && context.value.alertId)
let previewVersion = 0
onMounted(() => {
  access.value = sessionStorage.getItem('concert-alert-access') || ''
  const saved = sessionStorage.getItem('concert-alert-context')
  if (saved && access.value) { context.value = JSON.parse(saved); open() }
})
const message = e => e.data?.statusMessage || 'Your alert could not be saved. Please try again.'
async function preview() {
  const version = ++previewVersion
  summary.value = ''; error.value = ''
  try { const result = await $fetch('/api/alerts/preview', { method: 'POST', body: { criteria: query.value } }); if (version === previewVersion) summary.value = result.summary }
  catch (e) { if (version === previewVersion) error.value = message(e) }
}
function open() { opened.value = true; success.value = false; preview() }
function close() { const wasManaged = managed.value; opened.value = false; context.value = null; sessionStorage.removeItem('concert-alert-context'); if (wasManaged) navigateTo('/alerts/manage') }
watch(() => props.criteria, () => { if (opened.value) { success.value = false; preview() } }, { deep: true })
async function submit() {
  busy.value = true; error.value = ''
  try {
    const result = await $fetch(`/api/alerts/${managed.value ? (editing.value ? 'update' : 'create') : 'request'}`, { method: 'POST', body: { criteria: query.value, email: email.value, website: website.value, token: managed.value ? access.value : undefined, alertId: editing.value || undefined } })
    if (managed.value) {
      sessionStorage.removeItem('concert-alert-context')
      sessionStorage.setItem('concert-alert-notice', JSON.stringify({ message: result.duplicate ? 'You already have this alert.' : editing.value ? 'Alert updated.' : 'Alert saved. New matches will be included in your daily email.', alertId: result.alertId }))
      await navigateTo('/alerts/manage')
    }
    else success.value = true
  } catch (e) { error.value = message(e) }
  finally { busy.value = false }
}
</script>
