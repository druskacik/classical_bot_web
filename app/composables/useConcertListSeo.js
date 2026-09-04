export const CLASSICALBOT_ORIGIN = 'https://classicalbot.com'

export const getConcertListSeoState = ({ canonicalPath, query, indexable = true }) => {
  const hasQuery = Object.keys(query || {}).length > 0
  const allowIndex = !hasQuery && indexable

  return {
    robots: allowIndex ? 'index, follow' : 'noindex, follow',
    canonicalHref: !allowIndex
      ? null
      : new URL(canonicalPath, CLASSICALBOT_ORIGIN).href,
  }
}

export const useConcertListSeo = ({ title, description, canonicalPath, indexable = true }) => {
  const route = useRoute()
  const seoState = computed(() => getConcertListSeoState({
    canonicalPath: toValue(canonicalPath),
    query: route.query,
    indexable: toValue(indexable),
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
