<template>
  <NuxtLink
    :to="href"
    :target="resolvedTarget"
    :rel="isExternal ? 'noopener noreferrer' : undefined"
    class="content-link"
  >
    <slot />
  </NuxtLink>
</template>

<script setup lang="ts">
const props = defineProps<{
  href?: string
  target?: string
}>()

const isExternal = computed(() => /^(?:https?:)?\/\//i.test(props.href ?? ''))
const resolvedTarget = computed(() => props.target ?? (isExternal.value ? '_blank' : undefined))
</script>

<style scoped>
.content-link {
  color: var(--color-primary-600);
  text-decoration: none;
}

.content-link:hover {
  color: var(--color-primary-700);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
}

.content-link:focus-visible {
  border-radius: 0.125rem;
  outline: 2px solid var(--color-primary-600);
  outline-offset: 3px;
}
</style>
