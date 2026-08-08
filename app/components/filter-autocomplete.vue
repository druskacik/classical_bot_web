<template>
  <div ref="root" class="relative">
    <label :for="inputId" class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
      {{ label }}
    </label>

    <div
      class="flex min-h-11 flex-wrap items-center gap-1.5 border-b border-gray-300 bg-transparent py-1.5 focus-within:border-blue-600"
    >
      <span
        v-for="option in selectedOptions"
        :key="option.value"
        class="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-800"
      >
        <span class="truncate">{{ optionChipLabel(option) }}</span>
        <button
          type="button"
          class="shrink-0 text-blue-500 hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          :aria-label="`Remove ${optionChipLabel(option)}`"
          @click="remove(option.value)"
        >
          <span aria-hidden="true">×</span>
        </button>
      </span>

      <input
        :id="inputId"
        v-model="search"
        type="search"
        autocomplete="off"
        :placeholder="selectedOptions.length ? 'Add another…' : placeholder"
        class="min-w-32 flex-1 bg-transparent py-1 text-sm text-gray-900 outline-none placeholder:text-gray-400"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="listboxId"
        @focus="openOptions"
        @keydown.escape="open = false"
      >
    </div>

    <div
      v-if="open"
      :id="listboxId"
      role="listbox"
      class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-gray-200 bg-white py-1 shadow-lg"
    >
      <button
        v-for="option in availableOptions"
        :key="option.value"
        type="button"
        role="option"
        class="flex w-full items-start justify-between gap-4 px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
        @click="select(option)"
      >
        <span class="min-w-0">
          <span class="block truncate text-sm text-gray-900">{{ option.label }}</span>
          <span v-if="option.secondaryLabel" class="block truncate text-xs text-gray-500">
            {{ option.secondaryLabel }}
          </span>
        </span>
        <span class="shrink-0 pt-0.5 text-xs tabular-nums text-gray-400">{{ option.count }}</span>
      </button>
      <p v-if="loading" class="px-3 py-3 text-sm text-gray-500">Searching…</p>
      <p v-else-if="!availableOptions.length" class="px-3 py-3 text-sm text-gray-500">
        No matching options.
      </p>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  type: { type: String, required: true },
  label: { type: String, required: true },
  placeholder: { type: String, required: true },
  country: { type: String, default: null },
  modelValue: { type: Array, required: true },
})

const emit = defineEmits(['update:modelValue'])
const root = ref(null)
const search = ref('')
const open = ref(false)
const loading = ref(false)
const options = ref([])
const selectedOptions = ref([])
const requestSequence = ref(0)
const inputId = useId()
const listboxId = `${inputId}-listbox`
let debounceTimer

const availableOptions = computed(() => options.value.filter(
  option => !props.modelValue.includes(String(option.value)),
))

const optionChipLabel = (option) => {
  if (props.type === 'city') return option.label
  return option.secondaryLabel ? `${option.secondaryLabel} — ${option.label}` : option.label
}

const loadOptions = async () => {
  const sequence = ++requestSequence.value
  loading.value = true
  try {
    const response = await $fetch('/api/get-concert-filter-options', {
      params: {
        type: props.type,
        country: props.country || undefined,
        q: search.value || undefined,
        selected: props.modelValue.length ? props.modelValue.join(',') : undefined,
      },
    })
    if (sequence !== requestSequence.value) return

    options.value = response.items
    const byValue = new Map([
      ...selectedOptions.value,
      ...response.items,
    ].map(option => [String(option.value), { ...option, value: String(option.value) }]))
    selectedOptions.value = props.modelValue.map(value => byValue.get(String(value))).filter(Boolean)
  } finally {
    if (sequence === requestSequence.value) loading.value = false
  }
}

const openOptions = () => {
  open.value = true
  loadOptions()
}

const select = (option) => {
  const value = String(option.value)
  selectedOptions.value = [...selectedOptions.value, { ...option, value }]
  emit('update:modelValue', [...props.modelValue, value])
  search.value = ''
  open.value = false
}

const remove = (value) => {
  emit('update:modelValue', props.modelValue.filter(item => String(item) !== String(value)))
}

const handleOutsideClick = (event) => {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

watch(search, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(loadOptions, 220)
})

watch(() => [props.country, ...props.modelValue], () => loadOptions())

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  loadOptions()
})

onUnmounted(() => {
  clearTimeout(debounceTimer)
  document.removeEventListener('click', handleOutsideClick)
})
</script>
