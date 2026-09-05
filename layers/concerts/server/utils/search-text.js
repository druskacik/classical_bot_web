export const normalizeSearchText = (value) => String(value ?? '')
  .normalize('NFKD')
  .toLowerCase()
  .replaceAll('ß', 'ss')
  .replace(/\p{M}/gu, '')
  .replace(/[^\p{L}\p{N}_]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ')

export const containsNormalizedText = (value, search) => (
  normalizeSearchText(value).includes(search)
)

export const normalizedLikePattern = value => `%${value.replace(/[\\%_]/g, '\\$&')}%`
