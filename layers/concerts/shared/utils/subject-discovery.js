import { composerSelections, querySelections, serializeComposerSelections } from './concert-query.js'

export const isTrackingParameter = key => /^utm_[a-z0-9_]+$/i.test(key)
  || ['gclid', 'dclid', 'fbclid', 'msclkid'].includes(key)

export function singleSubjectSelection(query = {}) {
  const hasComposer = query.composers !== undefined
  const hasWork = query.works !== undefined
  if (hasComposer === hasWork) return null
  const raw = hasComposer ? query.composers : query.works
  if (typeof raw !== 'string') return null
  const values = hasComposer ? composerSelections(raw) : querySelections(raw)
  if (values.length !== 1) return null
  if (hasComposer) return { type: 'composer', value: values[0] }
  const id = Number(values[0])
  return Number.isSafeInteger(id) && id > 0 ? { type: 'work', value: id } : null
}

export function isSubjectDiscoveryQuery(query = {}) {
  const selection = singleSubjectSelection(query)
  if (!selection) return false
  const key = selection.type === 'composer' ? 'composers' : 'works'
  return Object.keys(query).every(name => name === key || name === 'page' || isTrackingParameter(name))
}

export function subjectMatchesQuery(subject, query) {
  const selection = singleSubjectSelection(query)
  return Boolean(subject && selection && subject.type === selection.type
    && (selection.type === 'composer' ? subject.name === selection.value : Number(subject.id) === selection.value))
}

// Shared by links, canonicals and sitemap entries. Do not serialize tracking here.
export function subjectListingPath(path, subject, page = 1) {
  const query = new URLSearchParams()
  if (subject.type === 'composer') query.set('composers', serializeComposerSelections([subject.name]))
  else query.set('works', String(subject.id))
  if (page > 1) query.set('page', String(page))
  return `${path}?${query}`
}

export function subjectMetadata(subject, locationPhrase = 'worldwide') {
  if (subject.type === 'composer') return {
    title: `${subject.name} concerts ${locationPhrase} — ClassicalBot`,
    heading: `Concerts featuring ${subject.name}’s music ${locationPhrase}`,
    description: `Find upcoming concerts featuring ${subject.name}’s music ${locationPhrase}. Browse dates, venues and programmes.`,
  }
  const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const catalogue = subject.catalogueNumber && !normalize(subject.title).includes(normalize(subject.catalogueNumber))
    ? `, ${subject.catalogueNumber}` : ''
  const label = `${subject.composerName}: ${subject.title}${catalogue}`
  return {
    title: `${label} ${locationPhrase} — ClassicalBot`,
    heading: `${label} ${locationPhrase}`,
    description: `Find upcoming performances of ${label} ${locationPhrase}. Browse concert dates, venues and programmes.`,
  }
}

export const composerProfilePath = (id, name) => {
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `/composers/${id}-${slug || 'composer'}`
}
