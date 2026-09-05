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
