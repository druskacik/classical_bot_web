<template>
  <div class="container mx-auto py-8 px-4">
    <h1 class="text-3xl font-serif mb-8 text-center">{{ title }}</h1>

    <ComposersFilter
      :composers="composers || []"
      :selected-composers="selectedComposers"
      @update:composers="updateSelectedComposers"
    />

    <div v-if="concertStatus === 'pending'">
      <UProgress indeterminate animation="swing" />
    </div>
    <div v-else-if="concertStatus === 'error'">
      <UAlert color="error" title="Concerts could not be loaded">
        Please try again later.
      </UAlert>
    </div>
    <div v-else-if="concerts?.length" class="container mx-auto py-8 px-4">
      <div v-for="(concertGroup, month) in groupedConcerts" :key="month" class="mb-8">
        <h2 class="text-2xl font-serif mb-4 capitalize">{{ month }}</h2>
        <ConcertsTable :concerts="concertGroup" />
      </div>
    </div>
    <div v-else class="py-12 px-6 text-center text-gray-600">
      No upcoming concerts match these filters.
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  countryCode: {
    type: String,
    default: null,
  },
})

const route = useRoute()
const router = useRouter()

const queryComposers = Array.isArray(route.query.composers)
  ? route.query.composers[0]
  : route.query.composers

const selectedComposers = ref(
  typeof queryComposers === 'string'
    ? queryComposers.split(',').map(value => value.trim()).filter(Boolean)
    : [],
)

const requestParams = computed(() => ({
  country: props.countryCode || undefined,
  composers: selectedComposers.value.length
    ? selectedComposers.value.join(',')
    : undefined,
}))

const { data: composers } = await useAsyncData(
  `composers-${props.countryCode || 'all'}`,
  () => $fetch('/api/get-composers', {
    params: { country: props.countryCode || undefined },
  }),
)

const {
  data: concerts,
  status: concertStatus,
} = await useAsyncData(
  `concerts-${props.countryCode || 'all'}`,
  () => $fetch('/api/get-concerts', { params: requestParams.value }),
  { watch: [requestParams] },
)

const groupedConcerts = computed(() => {
  if (!concerts.value) return {}

  return concerts.value.reduce((groups, concert) => {
    const month = new Date(concert.date).toLocaleString('en-GB', {
      month: 'long',
      year: 'numeric',
    })

    if (!groups[month]) groups[month] = []
    groups[month].push(concert)
    return groups
  }, {})
})

const updateSelectedComposers = async (newComposers) => {
  selectedComposers.value = [...newComposers]

  await router.push({
    query: {
      ...route.query,
      composers: newComposers.length ? newComposers.join(',') : undefined,
    },
  })
}

watch(
  () => route.query.composers,
  (value) => {
    const queryValue = Array.isArray(value) ? value[0] : value
    selectedComposers.value = typeof queryValue === 'string'
      ? queryValue.split(',').map(item => item.trim()).filter(Boolean)
      : []
  },
)
</script>
