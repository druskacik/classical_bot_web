export const getConcertListSeoState = ({ origin, canonicalPath, query, indexable = true }) => {
  // Only pagination and known, content-neutral tracking parameters are approved.
  // Subject/location filters need their own resolved landing-page policy first.
  const entries = Object.entries(query || {})
  const page = query?.page === undefined ? 1 : Number(query.page)
  const validPage = !Array.isArray(query?.page) && Number.isSafeInteger(page) && page >= 1
  const allowIndex = indexable && validPage && entries.every(([key]) => key === 'page'
    || /^utm_[a-z0-9_]+$/i.test(key) || ['gclid', 'dclid', 'fbclid', 'msclkid'].includes(key))
  const canonical = allowIndex ? new URL(canonicalPath, origin) : null
  if (canonical && page > 1) canonical.searchParams.set('page', String(page))

  return {
    robots: allowIndex ? 'index, follow' : 'noindex, follow',
    canonicalHref: canonical?.href || null,
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
