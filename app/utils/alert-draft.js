import { serializeConcertQuery, updateConcertQuery } from '../../layers/concerts/shared/utils/concert-query.js'

// Keep the dialog independent of both route state and the caller's saved object.
export function alertDraft(criteria = {}) {
  const source = { ...criteria, city: criteria.city ?? criteria.nearCity, radius: criteria.radius ?? criteria.radiusKm }
  return serializeConcertQuery(Object.fromEntries(
    ['country', 'city', 'radius', 'nearLat', 'nearLng', 'dateFrom', 'dateTo', 'datePreset', 'composers', 'works']
      .filter(key => source[key] != null && source[key] !== '')
      .map(key => [key, Array.isArray(source[key]) ? source[key].join(',') : String(source[key])]),
  ))
}

export function updateAlertDraft(draft, changes) {
  return updateConcertQuery(draft, changes)
}

export function alertCityRadius(draft, { city, radius }) {
  return updateConcertQuery(draft, { city, radius: radius ? String(radius) : undefined, ...(radius ? { country: undefined } : {}) })
}

// A radius or date preset alone does not narrow the search.
export function hasAlertFilter(draft) {
  const text = key => typeof draft[key] === 'string' && draft[key].trim().length > 0
  return ['country', 'city', 'dateFrom', 'dateTo'].some(text)
    || ['composers', 'works'].some(key => typeof draft[key] === 'string' && draft[key].split(',').some(value => value.trim()))
    || (text('nearLat') && text('nearLng') && text('radius'))
}
