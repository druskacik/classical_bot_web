import { computed } from 'vue'
import { normalizeConcertQuery, updateConcertQuery } from '../../shared/utils/concert-query.js'

// Route remains the single source of truth; no mirrored filter state.
export function useConcertQuery(route = useRoute(), router = useRouter()) {
  const query = computed(() => normalizeConcertQuery(route.query))
  const update = (changes, { replace = false, path, ...options } = {}) => router[replace ? 'replace' : 'push']({
    ...(path ? { path } : {}), query: updateConcertQuery(query.value, changes, options),
  })
  return { query, update }
}
