<template>
  <main class="container mx-auto max-w-2xl px-4 py-12">
    <h1 class="font-serif text-3xl text-gray-950">Your alerts</h1>
    <p v-if="email" class="mt-3 break-all text-gray-700">{{ email }}</p>
    <p class="mt-3 text-gray-700">One daily email with new matches across all your alerts.</p>
    <p v-if="notice" role="status" class="mt-4 text-gray-900">{{ notice }}</p>
    <p v-if="loading && !loaded" role="status" class="mt-6">Loading your alerts…</p>
    <template v-if="loaded">
      <button v-if="signupEnabled" type="button" class="mt-6 min-h-11 cursor-pointer bg-gray-900 px-4 text-white hover:bg-gray-700" @click="edit()">Add another alert</button>
      <p v-if="!alerts.length" class="mt-8 text-gray-700">You have no saved alerts. Choose a search to hear about new concerts.</p>
      <ul class="mt-6 divide-y divide-gray-200">
        <li v-for="alert in alerts" :key="alert.id" class="py-5" :aria-label="alert.summary">
          <h2 :id="`alert-${alert.id}`" :ref="el => { if (String(alert.id) === highlighted) highlightElement = el }" tabindex="-1" class="break-words font-serif text-xl text-gray-950">{{ alert.summary }}</h2>
          <p class="mt-2 text-sm text-gray-600">{{ statusLabel(alert.status) }}</p>
          <div v-if="removing === alert.id" class="mt-3">
            <p class="text-gray-800">Remove this alert? Your other searches will stay active.</p>
            <div class="mt-2 flex flex-wrap gap-5">
              <button type="button" :disabled="busy" class="min-h-11 cursor-pointer text-red-700 disabled:opacity-60" @click="remove(alert)">Remove alert</button>
              <button type="button" :disabled="busy" class="min-h-11 cursor-pointer text-gray-700" @click="removing = null">Keep alert</button>
            </div>
          </div>
          <div v-else class="mt-2 flex flex-wrap gap-5">
            <button v-if="signupEnabled" type="button" class="min-h-11 cursor-pointer text-primary hover:underline" @click="edit(alert)">{{ alert.status === 'active' ? 'Edit' : 'Review and save' }}</button>
            <button type="button" class="min-h-11 cursor-pointer text-gray-700 hover:underline" @click="removing = alert.id">Remove</button>
          </div>
        </li>
      </ul>
      <button v-if="nextOffset !== null" type="button" :disabled="loading" class="min-h-11 cursor-pointer text-primary disabled:opacity-60" @click="load(true)">{{ loading ? 'Loading…' : 'Show more' }}</button>
      <div v-if="alerts.some(a => ['active', 'pending', 'suspended'].includes(a.status)) || stopAll" class="mt-8 border-t border-gray-200 pt-5">
        <template v-if="stopAll">
          <p class="text-gray-800">Stop all concert emails? This will unsubscribe all your alerts, including those awaiting confirmation.</p>
          <div class="mt-3 flex flex-wrap gap-5">
            <button type="button" :disabled="busy" class="min-h-11 cursor-pointer text-red-700 disabled:opacity-60" @click="stop">Unsubscribe from all</button>
            <button type="button" :disabled="busy" class="min-h-11 cursor-pointer text-gray-700" @click="stopAll = false">Keep my alerts</button>
          </div>
        </template>
        <button v-else type="button" class="min-h-11 cursor-pointer text-gray-700 hover:underline" @click="stopAll = true">Unsubscribe from all</button>
      </div>
    </template>
    <p v-if="error" role="alert" class="mt-4 text-red-700">{{ error }}</p>
    <button v-if="error && secret && !loaded" type="button" class="mt-3 min-h-11 cursor-pointer text-primary" @click="load()">Try again</button>
    <NuxtLink to="/" class="mt-6 inline-flex min-h-11 items-center text-primary hover:underline">Browse concerts</NuxtLink>
  </main>
</template>
<script setup>
useHead({ title: 'Your alerts — ClassicalBot', meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
const config = useRuntimeConfig()
const signupEnabled = computed(() => String(config.public.alertsSignupEnabled) === 'true')
const secret = ref(''), email = ref(''), alerts = ref([]), loading = ref(true), loaded = ref(false), busy = ref(false), error = ref(''), notice = ref(''), nextOffset = ref(null), removing = ref(null), stopAll = ref(false), highlighted = ref(''), highlightElement = ref(null)
const statusLabel = status => ({ active: 'Active', pending: 'Awaiting email confirmation', expired: 'Ended — the selected dates have passed', suspended: 'Delivery stopped — your email could not receive messages', unsubscribed: 'Unsubscribed' })[status] || status
onMounted(async () => {
  const [fragment, action] = window.location.hash.slice(1).split(':')
  secret.value = fragment || sessionStorage.getItem('concert-alert-access') || ''
  if (fragment) sessionStorage.setItem('concert-alert-access', fragment)
  stopAll.value = action === 'unsubscribe'
  history.replaceState(history.state, '', window.location.pathname)
  sessionStorage.removeItem('concert-alert-context')
  const flash = sessionStorage.getItem('concert-alert-notice')
  if (flash) { const value = JSON.parse(flash); notice.value = value.message; highlighted.value = String(value.alertId || ''); sessionStorage.removeItem('concert-alert-notice') }
  if (!secret.value) { loading.value = false; error.value = 'Open Manage alerts from one of your concert emails to see your saved searches.'; return }
  await load()
})
async function load(more = false) {
  loading.value = true; error.value = ''
  try {
    const result = await $fetch('/api/alerts/manage', { method: 'POST', body: { token: secret.value, offset: more ? nextOffset.value : 0, focusId: highlighted.value || undefined } })
    email.value = result.email; alerts.value = more ? [...alerts.value, ...result.alerts] : result.alerts
    nextOffset.value = result.nextOffset; loaded.value = true
    await nextTick(); highlightElement.value?.focus({ preventScroll: true })
  } catch (e) { error.value = e.data?.statusMessage || 'Could not load your alerts. Please try again.' }
  finally { loading.value = false }
}
function edit(alert) {
  sessionStorage.setItem('concert-alert-context', JSON.stringify({ alertId: alert?.id || null, email: email.value }))
  navigateTo({ path: '/', query: alert?.criteria || {} })
}
async function remove(alert) {
  busy.value = true; error.value = ''
  try { await $fetch('/api/alerts/remove', { method: 'POST', body: { token: secret.value, alertId: alert.id } }); removing.value = null; notice.value = 'Alert removed.'; await load() }
  catch (e) { error.value = e.data?.statusMessage || 'Could not remove this alert. Please try again.' }
  finally { busy.value = false }
}
async function stop() {
  busy.value = true; error.value = ''
  try { await $fetch('/api/alerts/unsubscribe', { method: 'POST', body: { token: secret.value } }); stopAll.value = false; notice.value = 'You have unsubscribed from all alerts. No more concert emails will be sent.'; await load() }
  catch (e) { error.value = e.data?.statusMessage || 'Could not unsubscribe. Please try again.' }
  finally { busy.value = false }
}
</script>
