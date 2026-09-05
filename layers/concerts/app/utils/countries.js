const REGION_CODE_PATTERN = /^[A-Z]{2}$/

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })

export const normalizeCountryCode = (value) => {
  if (typeof value !== 'string') return null

  const code = value.trim().toUpperCase()
  return REGION_CODE_PATTERN.test(code) ? code : null
}

export const getCountryName = (value) => {
  const code = normalizeCountryCode(value)
  if (!code) return 'Unknown country'

  try {
    return displayNames.of(code) || code
  } catch {
    return code
  }
}

export const getCountrySlug = (name) => {
  if (typeof name !== 'string') return null

  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || null
}

export const getCountryPath = (value) => {
  const code = normalizeCountryCode(value)
  if (!code) return null

  const slug = getCountrySlug(getCountryName(code))
  return slug ? `/${slug}` : null
}
