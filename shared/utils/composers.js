export { composerProfilePath as composerPath } from '../../layers/concerts/shared/utils/subject-discovery.js'
import { subjectListingPath } from '../../layers/concerts/shared/utils/subject-discovery.js'

export const composerIdFromSlug = (slug) => {
  const match = typeof slug === 'string' && /^([1-9]\d*)(?:-[a-z0-9-]+)?$/.exec(slug)
  const id = match ? Number(match[1]) : NaN
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null
}

export const workLocation = id => subjectListingPath('/', { type: 'work', id })
export const composerConcertLocation = name => subjectListingPath('/', { type: 'composer', name })

export const catalogueLabel = (title, catalogue) => {
  const normalized = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  return catalogue && !normalized(title).includes(normalized(catalogue)) ? catalogue : null
}

export const seasonLabel = (start, end) => {
  const first = String(start).slice(0, 4)
  const last = String(end).slice(0, 4)
  return first === last ? first : `${first}/${last.slice(-2)}`
}
