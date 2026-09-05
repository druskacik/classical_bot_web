export const getConcertListSeoState = ({ origin, canonicalPath, query, indexable = true }) => {
  const hasQuery = Object.keys(query || {}).length > 0
  const allowIndex = !hasQuery && indexable

  return {
    robots: allowIndex ? 'index, follow' : 'noindex, follow',
    canonicalHref: !allowIndex
      ? null
      : new URL(canonicalPath, origin).href,
  }
}

export const useConcertListSeo = ({ title, description, canonicalPath, indexable = true }) => {
  const route = useRoute()
  const { concertSite } = useAppConfig()
  const seoState = computed(() => getConcertListSeoState({
    origin: concertSite.origin,
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
