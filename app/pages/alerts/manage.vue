<template>
  <main class="alerts-manage container mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
    <header class="border-b border-gray-200 pb-6">
      <h1 class="font-serif text-3xl text-gray-950">Your alerts</h1>
      <p v-if="email" class="mt-3 break-all text-gray-700">{{ email }}</p>
      <p class="mt-3 text-gray-700">One daily email with new matches across all your alerts.</p>
    </header>
    <p v-if="notice" ref="noticeElement" tabindex="-1" role="status" class="mt-4 text-gray-900">{{ notice }}</p>
    <p v-if="loading && !loaded" role="status" class="mt-6">Loading your alerts…</p>
    <template v-if="loaded">
      <button v-if="alertsEnabled" :disabled="busy || loading" type="button" class="mt-6 min-h-11 cursor-pointer bg-gray-900 px-5 text-sm text-white hover:bg-gray-700" aria-haspopup="dialog" @click="edit()">Add another alert</button>
      <p v-if="!alerts.length" class="mt-8 text-gray-700">You have no saved alerts. Choose a search to hear about new concerts.</p>
      <ul class="mt-6 divide-y divide-gray-200" :aria-busy="busy || loading">
        <li v-for="alert in alerts" :key="alert.id" class="py-6 sm:py-7" :aria-label="alert.summary">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div class="min-w-0 flex-1">
              <h2 :id="`alert-${alert.id}`" :ref="el => { if (String(alert.id) === highlighted) highlightElement = el }" tabindex="-1" class="break-words font-serif text-xl text-gray-950">{{ alert.summary }}</h2>
              <p class="mt-2 text-sm text-gray-600">{{ statusLabel(alert.status) }}</p>
            </div>
            <div v-if="removing === alert.id" class="max-w-xs text-sm" role="group" :aria-labelledby="`remove-prompt-${alert.id}`">
              <p :id="`remove-prompt-${alert.id}`" class="text-gray-800">Remove this alert? Your other searches will stay active.</p>
              <div class="mt-2 flex flex-wrap gap-5">
                <button type="button" :disabled="busy" class="min-h-11 cursor-pointer text-red-700 disabled:opacity-60" @click="remove(alert)">{{ busy ? 'Removing…' : 'Remove alert' }}</button>
                <button type="button" :disabled="busy" :id="`keep-alert-${alert.id}`" class="min-h-11 cursor-pointer text-gray-700 hover:underline" @click="cancelRemove(alert.id)">Keep alert</button>
              </div>
            </div>
            <div v-else class="flex shrink-0 flex-wrap gap-5 text-sm">
              <button v-if="alertsEnabled" :disabled="busy || loading" type="button" :aria-describedby="`alert-${alert.id}`" class="min-h-11 cursor-pointer text-primary hover:underline" aria-haspopup="dialog" @click="edit(alert)">{{ alert.status === 'active' ? 'Edit' : 'Review and save' }}</button>
              <button :id="`remove-alert-${alert.id}`" type="button" :disabled="busy || loading" :aria-describedby="`alert-${alert.id}`" class="min-h-11 cursor-pointer text-gray-700 hover:underline" @click="beginRemove(alert.id)">Remove</button>
            </div>
          </div>
        </li>
      </ul>
      <button v-if="nextOffset !== null" type="button" :disabled="loading || busy" class="min-h-11 cursor-pointer text-primary disabled:opacity-60" @click="load(true)">{{ loading ? 'Loading…' : 'Show more' }}</button>
      <div v-if="alerts.some(a => ['active', 'pending', 'suspended'].includes(a.status)) || stopAll" class="mt-10 border-t border-gray-200 pt-5 text-sm">
        <template v-if="stopAll">
          <p class="text-gray-800">Stop all concert emails? This will unsubscribe all your alerts, including those awaiting confirmation.</p>
          <div class="mt-3 flex flex-wrap gap-5">
            <button type="button" :disabled="busy" class="min-h-11 cursor-pointer text-base text-red-700 disabled:opacity-60" @click="stop">{{ busy ? 'Unsubscribing…' : 'Unsubscribe from all' }}</button>
            <button type="button" :disabled="busy" id="keep-all-alerts" class="min-h-11 cursor-pointer text-gray-700 hover:underline" @click="cancelStop">Keep my alerts</button>
          </div>
        </template>
        <button v-else id="stop-all-alerts" type="button" :disabled="busy || loading" class="min-h-11 cursor-pointer text-base text-gray-700 hover:underline" @click="beginStop">Unsubscribe from all</button>
      </div>
    </template>
    <p v-if="error" role="alert" class="mt-4 text-red-700">{{ error }}</p>
    <button v-if="error && secret && !loaded" type="button" :disabled="loading" class="mt-3 min-h-11 cursor-pointer text-primary hover:underline" @click="load()">Try again</button>
    <AlertDialog v-if="editor" :initial-criteria="editor.criteria" :alert-id="editor.id" :token="secret" :subscriber-email="email" @close="editor = null" @saved="saved" />
    <NuxtLink to="/" class="mt-6 inline-flex min-h-11 items-center text-primary hover:underline">Browse concerts</NuxtLink>
  </main>
</template>
<script setup>
useHead({ title: 'Your alerts — ClassicalBot', meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
const config = useRuntimeConfig()
const alertsEnabled = computed(() => String(config.public.alertsEnabled) === 'true')
const editor = ref(null), noticeElement = ref(null)
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
async function focusControl(id) {
  await nextTick()
  document.getElementById(id)?.focus({ preventScroll: true })
}
function beginRemove(id) {
  stopAll.value = false
  removing.value = id
  focusControl(`keep-alert-${id}`)
}
function cancelRemove(id) {
  removing.value = null
  focusControl(`remove-alert-${id}`)
}
function beginStop() {
  removing.value = null
  stopAll.value = true
  focusControl('keep-all-alerts')
}
function cancelStop() {
  stopAll.value = false
  focusControl('stop-all-alerts')
}
async function focusNotice() {
  await nextTick()
  noticeElement.value?.focus()
}
async function load(more = false) {
  loading.value = true; error.value = ''
  try {
    const result = await $fetch('/api/alerts/manage', { method: 'POST', body: { token: secret.value, offset: more ? nextOffset.value : 0, focusId: highlighted.value || undefined } })
    email.value = result.email; alerts.value = more ? [...alerts.value, ...result.alerts] : result.alerts
    nextOffset.value = result.nextOffset; loaded.value = true
    await nextTick(); if (!more) highlightElement.value?.focus({ preventScroll: true })
  } catch (e) { error.value = e.data?.statusMessage || 'Could not load your alerts. Please try again.' }
  finally { loading.value = false }
}
function edit(alert) {
  editor.value = { id: alert?.id ?? null, criteria: alert?.criteria || {} }
}
async function saved(result) {
  notice.value = result.message
  highlighted.value = String(result.alertId || '')
  await load()
}
async function remove(alert) {
  if (busy.value || loading.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try { await $fetch('/api/alerts/remove', { method: 'POST', body: { token: secret.value, alertId: alert.id } }); removing.value = null; notice.value = 'Alert removed.'; highlighted.value = ''; highlightElement.value = null; await load(); await focusNotice() }
  catch (e) { error.value = e.data?.statusMessage || 'Could not remove this alert. Please try again.' }
  finally { busy.value = false }
}
async function stop() {
  if (busy.value || loading.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try { await $fetch('/api/alerts/unsubscribe', { method: 'POST', body: { token: secret.value } }); stopAll.value = false; notice.value = 'You have unsubscribed from all alerts. No more concert emails will be sent.'; highlighted.value = ''; highlightElement.value = null; await load(); await focusNotice() }
  catch (e) { error.value = e.data?.statusMessage || 'Could not unsubscribe. Please try again.' }
  finally { busy.value = false }
}
</script>

<style scoped>
.alerts-manage { --ui-primary: var(--color-primary-600); }
.alerts-manage :deep(button:focus-visible), .alerts-manage :deep(a:focus-visible) { outline: 2px solid var(--ui-primary); outline-offset: 3px; }
.alerts-manage :deep(a), .alerts-manage :deep(button) { text-underline-offset: 4px; }
.alerts-manage :deep(button:disabled) { cursor: not-allowed; opacity: 0.6; }
.alerts-manage :deep(button) { min-width: 2.75rem; }
</style>
