export const composerPath = (id, name) => {
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `/composers/${id}-${slug || 'composer'}`
}

export const composerIdFromSlug = (slug) => {
  const match = typeof slug === 'string' && /^([1-9]\d*)(?:-[a-z0-9-]+)?$/.exec(slug)
  const id = match ? Number(match[1]) : NaN
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null
}

export const workLocation = id => ({ path: '/', query: { works: String(id) } })
export const composerConcertLocation = name => ({ path: '/', query: { composers: name } })

export const catalogueLabel = (title, catalogue) => {
  const normalized = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  return catalogue && !normalized(title).includes(normalized(catalogue)) ? catalogue : null
}

export const seasonLabel = (start, end) => {
  const first = String(start).slice(0, 4)
  const last = String(end).slice(0, 4)
  return first === last ? first : `${first}/${last.slice(-2)}`
}
