export const CLASSICALBOT_ORIGIN = 'https://classicalbot.com'

export const getConcertListSeoState = ({ canonicalPath, query }) => {
  const hasQuery = Object.keys(query || {}).length > 0

  return {
    robots: hasQuery ? 'noindex, follow' : 'index, follow',
    canonicalHref: hasQuery
      ? null
      : new URL(canonicalPath, CLASSICALBOT_ORIGIN).href,
  }
}

export const useConcertListSeo = ({ title, description, canonicalPath }) => {
  const route = useRoute()
  const seoState = computed(() => getConcertListSeoState({
    canonicalPath,
    query: route.query,
  }))

  useSeoMeta({
    title,
    description,
    robots: () => seoState.value.robots,
  })

  useHead(() => ({
    link: seoState.value.canonicalHref
      ? [{ rel: 'canonical', href: seoState.value.canonicalHref }]
      : [],
  }))
}
