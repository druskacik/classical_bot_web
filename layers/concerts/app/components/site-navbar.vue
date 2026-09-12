<template>
    <nav class="bg-white" :aria-label="labels.navigation">
        <div class="container mx-auto px-4">
            <div class="flex justify-between items-center h-16">
                <NuxtLink
                    to="/"
                    class="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900"
                    :aria-label="labels.home"
                >
                    <BrandLogo :name="brandName" />
                </NuxtLink>
                <!-- Keep SSR links, but hydrate only at Tailwind's md breakpoint. -->
                <LazyUNavigationMenu
                    hydrate-on-media-query="(min-width: 48rem)"
                    content-orientation="vertical"
                    variant="link"
                    :highlight="false"
                    :items="items"
                    :external-icon="externalIcon"
                    class="hidden md:block w-full ml-6 z-1"
                />
                <!-- Mobile hamburger menu -->
                <div class="md:hidden">
                    <UButton
                        ref="menuButton"
                        class="p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        @click="isMenuOpen = !isMenuOpen"
                        variant="link"
                        :aria-label="labels.open"
                        :aria-expanded="isMenuOpen"
                        aria-controls="mobile-menu"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </UButton>
                    <div
                        v-if="isMenuOpen"
                        id="mobile-menu"
                        class="fixed inset-0 z-50 overflow-y-auto bg-white"
                        role="dialog"
                        aria-modal="true"
                        :aria-label="labels.menu"
                        @keydown.escape="closeMenu"
                        @keydown.tab="trapFocus"
                        @click="onMenuClick"
                    >
                        <div class="flex items-center justify-between border-b border-gray-100 p-4">
                            <NuxtLink
                                to="/"
                                class="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900"
                                :aria-label="labels.home"
                            >
                                <BrandLogo :name="brandName" />
                            </NuxtLink>
                            <UButton
                                ref="closeButton"
                                class="text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                @click="closeMenu"
                                variant="link"
                                :aria-label="labels.close"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </UButton>
                        </div>
                        <LazyUNavigationMenu
                            orientation="vertical"
                            variant="link"
                            :highlight="false"
                            color="neutral"
                            :items="items"
                            :external-icon="externalIcon"
                        >
                            <template #item="{ item }">
                                <span class="block px-4 py-2 text-gray-800 hover:text-gray-900">
                                    {{ item.label }}
                                </span>
                            </template>
                            <template #countries="{ item }">
                                <span class="block px-4 py-2 text-gray-800 hover:text-gray-900">
                                    <div class="flex items-center">
                                        {{ item.label }}
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </span>
                            </template>
                        </LazyUNavigationMenu>
                    </div>
                </div>
            </div>
        </div>
    </nav>
</template>

<script setup>

defineProps({
  externalIcon: { type: Boolean, default: true },
  items: { type: Array, required: true },
  brandName: { type: String, default: 'ClassicalBot' },
  labels: { type: Object, default: () => ({ navigation: 'Primary navigation', home: 'ClassicalBot home', open: 'Open menu', close: 'Close menu', menu: 'Navigation menu' }) },
})

const isMenuOpen = ref(false)
const menuButton = ref(null)
const closeButton = ref(null)

const trapFocus = (event) => {
  const elements = [...event.currentTarget.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')]
    .filter(element => element.getClientRects().length)
  const first = elements[0]
  const last = elements.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
const onMenuClick = (event) => {
  if (event.target.closest('a[href]')) closeMenu(false)
}

const router = useRouter()
const closeMenu = (restoreFocus = true) => {
  isMenuOpen.value = false
  if (restoreFocus) nextTick(() => menuButton.value?.$el?.focus())
}

// Close mobile menu when route changes
watch(
  () => router.currentRoute.value.path,
  () => {
    closeMenu(false)
  }
)

watch(isMenuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) nextTick(() => closeButton.value?.$el?.focus())
})

onUnmounted(() => {
  document.body.style.overflow = ''
})


</script>
