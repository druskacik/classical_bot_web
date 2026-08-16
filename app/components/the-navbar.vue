<template>
    <nav class="bg-white" aria-label="Primary navigation">
        <div class="container mx-auto px-4">
            <div class="flex justify-between items-center h-16">
                <NuxtLink
                    to="/"
                    class="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900"
                    aria-label="ClassicalBot home"
                >
                    <BrandLogo />
                </NuxtLink>
                <!-- Desktop menu -->
                <UNavigationMenu
                    content-orientation="vertical"
                    variant="link"
                    :highlight="false"
                    :items="items"
                    class="hidden md:block w-full ml-6 z-1"
                />
                <!-- Mobile hamburger menu -->
                <div class="md:hidden">
                    <UButton
                        ref="menuButton"
                        class="p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        @click="isMenuOpen = !isMenuOpen"
                        variant="link"
                        aria-label="Open menu"
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
                        aria-label="Navigation menu"
                        @keydown.escape="closeMenu"
                    >
                        <div class="flex items-center justify-between border-b border-gray-100 p-4">
                            <NuxtLink
                                to="/"
                                class="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900"
                                aria-label="ClassicalBot home"
                            >
                                <BrandLogo />
                            </NuxtLink>
                            <UButton
                                ref="closeButton"
                                class="text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                @click="closeMenu"
                                variant="link"
                                aria-label="Close menu"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </UButton>
                        </div>
                        <UNavigationMenu
                            orientation="vertical"
                            variant="link"
                            :highlight="false"
                            color="neutral"
                            :items="items"
                        >
                            <template #item="{ item }">
                                <a :href="item.href" class="block px-4 py-2 text-gray-800 hover:text-gray-900">
                                    {{ item.label }}
                                </a>
                            </template>
                            <template #countries="{ item }">
                                <a :href="item.href" class="block px-4 py-2 text-gray-800 hover:text-gray-900">
                                    <div class="flex items-center">
                                        {{ item.label }}
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </a>
                            </template>
                        </UNavigationMenu>
                    </div>
                </div>
            </div>
        </div>
    </nav>
</template>

<script setup>

import { getCountryPath } from '~/utils/countries.js'

const isMenuOpen = ref(false)
const menuButton = ref(null)
const closeButton = ref(null)

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


const { data: countries } = await useAsyncData(
    'countries',
    () => $fetch('/api/get-countries'),
)

const items = computed(() => [
    {
        label: 'Countries',
        children: (countries.value || []).map(country => ({
            label: country.name,
            href: getCountryPath(country.code),
        })),
        slot: 'countries'
    },
    { label: 'Sources', href: '/sources' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
]);
</script>
