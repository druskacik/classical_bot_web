<template>
  <div class="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
    <h1 class="font-serif text-3xl text-gray-900">Contact</h1>
    <p class="mt-4 text-gray-600">Don't hesitate to contact us, we are friendly.</p>

    <form class="mt-8 space-y-6" action="/api/contact" method="post" :aria-busy="sending" @submit.prevent="submit" @input="success = false">
      <div>
        <label for="contact-name" class="contact-label">Name</label>
        <input id="contact-name" ref="nameInput" v-model="form.name" class="contact-field" name="name" autocomplete="name" required maxlength="100" :readonly="sending" :aria-invalid="!!errors.name" :aria-describedby="errors.name ? 'contact-name-error' : undefined" @input="errors.name = ''">
        <p v-if="errors.name" id="contact-name-error" class="mt-2 text-sm text-red-700">{{ errors.name }}</p>
      </div>
      <div>
        <label for="contact-email" class="contact-label">Email</label>
        <input id="contact-email" ref="emailInput" v-model="form.email" class="contact-field" name="email" type="email" autocomplete="email" required maxlength="254" :readonly="sending" :aria-invalid="!!errors.email" :aria-describedby="errors.email ? 'contact-email-error' : 'contact-email-help'" @input="errors.email = ''">
        <p id="contact-email-help" class="mt-2 text-sm text-gray-600">So we can reply to you.</p>
        <p v-if="errors.email" id="contact-email-error" class="mt-2 text-sm text-red-700">{{ errors.email }}</p>
      </div>
      <div>
        <label for="contact-message" class="contact-label">Message</label>
        <textarea id="contact-message" ref="messageInput" v-model="form.message" class="contact-field min-h-40 resize-y" name="message" rows="6" required maxlength="5000" :readonly="sending" :aria-invalid="!!errors.message" :aria-describedby="errors.message ? 'contact-message-error' : undefined" @input="errors.message = ''" />
        <p v-if="errors.message" id="contact-message-error" class="mt-2 text-sm text-red-700">{{ errors.message }}</p>
      </div>
      <div class="contact-trap" aria-hidden="true" inert>
        <label for="contact-website">Website</label>
        <input id="contact-website" v-model="form.website" name="website" tabindex="-1" autocomplete="off">
      </div>
      <button class="min-h-11 cursor-pointer bg-blue-700 px-5 py-2.5 text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60" type="submit" :disabled="!ready || sending">
        {{ sending ? 'Sending…' : 'Send message' }}
      </button>
      <p v-if="failure" role="alert" class="text-sm text-red-700">{{ failure }}</p>
      <p role="status" aria-live="polite" class="text-gray-700">{{ success ? 'Thank you. Your message has been sent.' : '' }}</p>
      <noscript class="text-sm text-gray-600">Please enable JavaScript to send a message.</noscript>
    </form>
  </div>
</template>

<script setup>
useSeoMeta({ title: 'Contact — ClassicalBot', description: 'Contact ClassicalBot.' })

const form = reactive({ name: '', email: '', message: '', website: '' })
const errors = reactive({ name: '', email: '', message: '' })
const sending = ref(false)
const ready = ref(false)
onMounted(() => { ready.value = true })
const success = ref(false)
const failure = ref('')
const nameInput = ref(null)
const emailInput = ref(null)
const messageInput = ref(null)

async function submit() {
  if (sending.value) return
  sending.value = true
  success.value = false
  failure.value = ''
  Object.assign(errors, { name: '', email: '', message: '' })
  try {
    await $fetch('/api/contact', { method: 'POST', body: { ...form }, retry: 0 })
    Object.assign(form, { name: '', email: '', message: '', website: '' })
    success.value = true
  } catch (error) {
    const fields = error.data?.data?.fields
    if (fields) {
      for (const key of ['name', 'email', 'message']) errors[key] = fields[key] || ''
      failure.value = 'Please check the highlighted fields.'
      await nextTick()
      const inputs = { name: nameInput, email: emailInput, message: messageInput }
      inputs[Object.keys(inputs).find(key => errors[key])]?.value?.focus()
    } else {
      failure.value = error.statusCode === 429
        ? 'Too many messages. Please wait a while before trying again.'
        : 'Your message could not be sent. Your text is still here; please try again later.'
    }
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.contact-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gray-600);
}
.contact-field {
  appearance: none;
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-height: 2.75rem;
  margin-top: 0.5rem;
  padding: 0.5rem 0;
  border: 0;
  border-bottom: 2px solid var(--color-gray-300);
  border-radius: 0;
  background: transparent;
  color: var(--color-gray-900);
  font-size: 1rem;
  caret-color: var(--color-blue-700);
}
input.contact-field {
  height: 2.75rem;
  margin-top: 0;
  padding: 0.375rem 0;
}
textarea.contact-field {
  border: 1px solid var(--color-gray-300);
  border-bottom-width: 2px;
  padding: 0.75rem;
}
.contact-field:focus {
  outline: none;
  border-bottom-color: var(--color-blue-700);
  box-shadow: none;
}
.contact-field[aria-invalid="true"] { border-color: var(--color-red-700); }
@media (forced-colors: active) {
  .contact-field:focus {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}
.contact-trap { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
