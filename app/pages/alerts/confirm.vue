<template>
  <main class="container mx-auto max-w-xl px-4 py-12">
    <h1 class="font-serif text-3xl text-gray-950">Your concert alert</h1>
    <p v-if="busy" role="status" class="mt-4 text-gray-700">Confirming your alert…</p>
    <p class="mt-4 text-gray-700">Receive one daily email when new concerts match your search. Concerts already listed will not be emailed.</p>
    <p v-if="error" role="alert" class="mt-4 text-red-700">{{ error }}</p>
    <button v-if="error && secret" type="button" :disabled="busy" class="mt-6 min-h-11 cursor-pointer bg-gray-900 px-4 text-white hover:bg-gray-700 disabled:opacity-60" @click="confirm">Try again</button>
    <NuxtLink to="/" class="mt-6 block text-primary hover:underline">Browse concerts</NuxtLink>
  </main>
</template>
<script setup>
useHead({ title: 'Confirm concert alert — ClassicalBot', meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
const secret = ref(''), busy = ref(true), error = ref('')
onMounted(() => {
  secret.value = window.location.hash.slice(1)
  history.replaceState(history.state, '', window.location.pathname)
  if (!secret.value) {
    error.value = 'This link is invalid. Create your alert again to receive a new link.'
    busy.value = false
    return
  }
  confirm()
})
async function confirm() {
  busy.value = true
  error.value = ''
  try { const result = await $fetch('/api/alerts/confirm', { method: 'POST', body: { token: secret.value }, retry: 0 }); sessionStorage.setItem('concert-alert-notice', JSON.stringify({ message: result.duplicate ? 'You already have this alert.' : 'Your alert is active. New matches will be included in your daily email.', alertId: result.alertId })); await navigateTo(`/alerts/manage#${result.token}`, { replace: true }) }
  catch (e) { error.value = e.data?.statusMessage || 'Could not confirm your alert. Please try again.' }
  finally { busy.value = false }
}
</script>
