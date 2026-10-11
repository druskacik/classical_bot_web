import { isTrackingParameter, isSubjectDiscoveryQuery, subjectMatchesQuery, subjectListingPath } from '../../shared/utils/subject-discovery.js'

export const getConcertListSeoState = ({ origin, canonicalPath, query, indexable = true, subjectDiscovery = false, discovery = null }) => {
  const entries = Object.entries(query || {})
  const page = query?.page === undefined ? 1 : Number(query.page)
  const validPage = !Array.isArray(query?.page) && Number.isSafeInteger(page) && page >= 1
  const subjectAllowed = subjectDiscovery && isSubjectDiscoveryQuery(query)
    && discovery?.status === 'resolved' && subjectMatchesQuery(discovery.subject, query)
  const allowIndex = indexable && validPage && (subjectAllowed
    || entries.every(([key]) => key === 'page' || isTrackingParameter(key)))
  const canonical = allowIndex ? new URL(subjectAllowed
    ? subjectListingPath(canonicalPath, discovery.subject, page) : canonicalPath, origin) : null
  if (canonical && !subjectAllowed && page > 1) canonical.searchParams.set('page', String(page))

  return {
    robots: allowIndex ? 'index, follow' : 'noindex, follow',
    canonicalHref: canonical?.href || null,
  }
}

export const useConcertListSeo = ({ title, description, canonicalPath, indexable = true, discovery = null }) => {
  const route = useRoute()
  const { concertSite } = useAppConfig()
  const seoState = computed(() => getConcertListSeoState({
    origin: concertSite.origin,
    canonicalPath: toValue(canonicalPath),
    query: route.query,
    indexable: toValue(indexable),
    subjectDiscovery: concertSite.subjectDiscovery,
    discovery: toValue(discovery),
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
