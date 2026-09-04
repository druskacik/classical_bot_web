<template>
  <div ref="root" class="relative">
    <label :for="inputId" class="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
      {{ label }}
    </label>

    <div
      class="flex min-h-11 flex-wrap items-center gap-1.5 border-b border-gray-300 bg-transparent py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25"
    >
      <span
        v-for="option in selectedOptions"
        :key="option.value"
        class="inline-flex max-w-full items-center rounded-full bg-primary/10 py-0.5 pl-2.5 pr-0.5 text-xs text-primary"
      >
        <span class="truncate">{{ optionChipLabel(option) }}</span>
        <button
          type="button"
          class="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-base leading-none text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-white active:bg-primary/20 [@media(pointer:coarse)]:size-11"
          :aria-label="`Remove ${optionChipLabel(option)} filter`"
          @click="remove(option.value)"
        >
          <span aria-hidden="true">×</span>
        </button>
      </span>

      <input
        :id="inputId"
        v-model="search"
        type="search"
        maxlength="100"
        autocomplete="off"
        :placeholder="selectedOptions.length ? (type === 'city' ? 'Change city…' : 'Add another…') : placeholder"
        class="min-w-32 flex-1 bg-transparent py-1 text-sm text-gray-900 outline-none placeholder:text-gray-400"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="listboxId"
        :aria-activedescendant="activeOptionId"
        :aria-describedby="statusId"
        @focus="openOptions"
        @keydown.down.prevent="moveActiveOption(1)"
        @keydown.up.prevent="moveActiveOption(-1)"
        @keydown.enter.prevent="selectActiveOption"
        @keydown.escape="closeOptions"
      >
    </div>

    <div
      v-if="open && loadError"
      class="absolute z-20 mt-1 w-full border border-gray-200 bg-white px-3 py-3 text-sm text-gray-600 shadow-lg"
    >
      <p>Options could not be loaded.</p>
      <button
        type="button"
        class="mt-1 cursor-pointer text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="loadOptions"
      >
        Try again
      </button>
    </div>

    <div
      v-else-if="open"
      :id="listboxId"
      role="listbox"
      class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-gray-200 bg-white py-1 shadow-lg"
    >
      <button
        v-for="(option, index) in availableOptions"
        :key="option.value"
        :id="optionId(index)"
        type="button"
        role="option"
        :aria-selected="index === activeIndex"
        :class="['flex w-full items-start justify-between gap-4 px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none', index === activeIndex && 'bg-gray-50']"
        tabindex="-1"
        @mouseenter="activeIndex = index"
        @click="select(option)"
      >
        <span class="min-w-0">
          <span class="block truncate text-sm text-gray-900">{{ option.label }}</span>
          <span v-if="option.secondaryLabel" class="block truncate text-xs text-gray-500">
            {{ option.secondaryLabel }}
          </span>
        </span>
        <span v-if="showCount" class="shrink-0 pt-0.5 text-xs tabular-nums text-gray-400">{{ option.count }}</span>
      </button>
      <p v-if="loading" class="px-3 py-3 text-sm text-gray-500">Searching…</p>
      <p v-else-if="!availableOptions.length" class="px-3 py-3 text-sm text-gray-500">
        No matching options.
      </p>
    </div>

    <p :id="statusId" class="sr-only" role="status" aria-live="polite">
      {{ statusMessage }}
    </p>
  </div>
</template>

<script setup>
const props = defineProps({
  type: { type: String, required: true },
  label: { type: String, required: true },
  placeholder: { type: String, required: true },
  country: { type: String, default: null },
  cityId: { type: String, default: null },
  showCount: { type: Boolean, default: true },
  modelValue: { type: Array, required: true },
})

const emit = defineEmits(['update:modelValue'])
const root = ref(null)
const search = ref('')
const open = ref(false)
const loading = ref(false)
const loadError = ref(false)
const options = ref([])
const selectedOptions = ref([])
const requestSequence = ref(0)
const activeIndex = ref(-1)
const inputId = useId()
const listboxId = `${inputId}-listbox`
const statusId = `${inputId}-status`
let debounceTimer

const availableOptions = computed(() => options.value.filter(
  option => !props.modelValue.includes(String(option.value)),
))

const optionChipLabel = (option) => {
  if (props.type === 'city') return option.label
  return option.secondaryLabel ? `${option.secondaryLabel} — ${option.label}` : option.label
}

const optionId = index => `${listboxId}-option-${index}`
const activeOptionId = computed(() => activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined)
const statusMessage = computed(() => {
  if (!open.value) return ''
  if (loadError.value) return 'Options could not be loaded. Try again.'
  if (loading.value) return 'Searching for options.'
  const count = availableOptions.value.length
  return count ? `${count} ${count === 1 ? 'option' : 'options'} available.` : 'No matching options.'
})

const loadOptions = async () => {
  const sequence = ++requestSequence.value
  loading.value = true
  loadError.value = false
  try {
    const response = await $fetch('/api/get-concert-filter-options', {
      params: {
        type: props.type,
        country: props.country || undefined,
        cityId: props.cityId || undefined,
        q: search.value || undefined,
        selected: props.modelValue.length ? props.modelValue.join(',') : undefined,
      },
    })
    if (sequence !== requestSequence.value) return

    const items = Array.isArray(response?.items) ? response.items : []
    options.value = items
    const byValue = new Map([
      ...selectedOptions.value,
      ...items,
    ].map(option => [String(option.value), { ...option, value: String(option.value) }]))
    selectedOptions.value = props.modelValue.map(value => byValue.get(String(value)) || {
      value: String(value),
      label: props.type === 'work' ? `Work ${value}` : String(value),
    })
    activeIndex.value = -1
  } catch {
    if (sequence !== requestSequence.value) return
    loadError.value = true
    activeIndex.value = -1
  } finally {
    if (sequence === requestSequence.value) loading.value = false
  }
}

const openOptions = () => {
  open.value = true
  loadOptions()
}

const closeOptions = () => {
  open.value = false
  activeIndex.value = -1
}

const moveActiveOption = (direction) => {
  if (!open.value) {
    openOptions()
    return
  }
  const count = availableOptions.value.length
  if (!count) return
  activeIndex.value = activeIndex.value < 0
    ? (direction > 0 ? 0 : count - 1)
    : (activeIndex.value + direction + count) % count
  nextTick(() => document.getElementById(optionId(activeIndex.value))?.scrollIntoView({ block: 'nearest' }))
}

const selectActiveOption = () => {
  if (!open.value) {
    openOptions()
    return
  }
  const option = availableOptions.value[activeIndex.value]
  if (option) select(option)
}

const select = (option) => {
  const value = String(option.value)
  selectedOptions.value = [...selectedOptions.value, { ...option, value }]
  emit('update:modelValue', [...props.modelValue, value])
  search.value = ''
  closeOptions()
}

const remove = (value) => {
  emit('update:modelValue', props.modelValue.filter(item => String(item) !== String(value)))
}

const handleOutsideClick = (event) => {
  if (root.value && !root.value.contains(event.target)) closeOptions()
}

watch(search, () => {
  clearTimeout(debounceTimer)
  if (open.value) debounceTimer = setTimeout(loadOptions, 220)
})

watch(() => [props.country, props.cityId, ...props.modelValue], () => {
  const selectedValues = new Set(props.modelValue.map(value => String(value)))
  selectedOptions.value = selectedOptions.value.filter(option => selectedValues.has(String(option.value)))
  if (open.value || props.modelValue.length) loadOptions()
})

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  loadOptions()
})

onUnmounted(() => {
  clearTimeout(debounceTimer)
  document.removeEventListener('click', handleOutsideClick)
})
</script>
