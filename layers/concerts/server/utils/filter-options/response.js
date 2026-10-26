// @ts-check
import { getCountryName } from '../countries.js'

/** @param {import('./types').PreparedRequest} request @param {import('./types').LoaderResult} loaded
 * @returns {import('../../../shared/types/concert-filter-options').FilterOptionsResponse} */
export function assembleFilterOptions(request, loaded) {
  const { type, context, includeUnavailable } = request
  const { suggestions, selectedOptions: labels } = loaded
  /** @type {Map<string, import('../../../shared/types/concert-filter-options').FilterOption>} */
  const items = new Map(suggestions.filter(item => includeUnavailable || Number(item.count) > 0).map(item => [String(item.value), { ...item, value: String(item.value), count: Number(item.count) }]))
  for (const label of labels) if (!items.has(String(label.value))) items.set(String(label.value), { ...label, value: String(label.value), count: Number(label.count || 0) })
  const result = [...items.values()].map(item => ({ ...item,
    ...(type === 'city' && !context.country ? { secondaryLabel: getCountryName(item.country_code) } : {}),
  }))
  if (type === 'country') result.sort((a, b) => a.label.localeCompare(b.label, 'en'))
  return { items: result }
}
