import { fields } from './contract.js'
import { getCountryName } from '../../../layers/concerts/server/utils/countries.js'
const id = value => value == null ? null : String(value)
const timestamp = value => value == null ? null : new Date(value).toISOString()
const joined = values => values.filter(Boolean).join('; ') || null
export function serializeConcert(row, source, relations) {
  const performers = relations.performers.map(p => ({
    id: id(p.id), name: p.name, kind: p.kind, roles: p.roles, instruments: p.instruments,
    voice_type: p.voice_type, character: p.character_name,
    ensemble: p.ensemble_id == null ? null : { id: id(p.ensemble_id), name: p.ensemble_name },
    qualifier: p.qualifier, identity_url: p.identity_url,
  }))
  const programme = relations.works.map(w => ({
    id: id(w.id), title: w.title, programme_label: w.programme_label, catalogue_number: w.catalogue_number,
    composer: { id: id(w.composer_id), name: w.composer_name },
  }))
  const composers = [...new Map([
    ...relations.composers.map(c => [id(c.id), { id: id(c.id), name: c.name }]),
    ...programme.map(w => [w.composer.id, w.composer]),
  ]).values()].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id))
  const prices = relations.prices.map(p => ({
    id: id(p.id), kind: p.kind, price_type: p.price_type, amount: String(p.amount),
    amount_max: p.amount_max == null ? null : String(p.amount_max), currency: p.currency,
    category: p.category, audience: p.audience, conditions: p.conditions, basis: p.basis,
  }))
  const result = {
    artists: joined([...new Set(performers.map(p => p.name))]), date: row.date, time: row.time_from,
    venue_name: row.venue_name || row.venue, city: row.city, state: null,
    country: row.country_code ? getCountryName(row.country_code) : null,
    venue_address: row.venue_address, buy_url: row.buy_url,
    id: id(row.id), title: row.title?.replace(/\s+/g, ' ').trim() || null,
    event_url: row.url, end_time: row.time_to, event_status: row.event_status,
    last_verified_at: timestamp(row.last_verified_at), country_code: row.country_code,
    venue_id: id(row.venue_id), venue_url: row.venue_url, parent_venue_name: row.parent_venue_name,
    latitude: row.latitude, longitude: row.longitude,
    programme: joined(programme.map(w => `${w.composer.name} — ${w.programme_label || w.title}`)),
    programme_items: programme, composers, performers,
    prices: joined(prices.map(p => [
      `${p.price_type}: ${p.kind === 'from' ? 'from ' : ''}${p.amount}${p.kind === 'range' ? `–${p.amount_max}` : ''} ${p.currency}`,
      ...[p.category, p.audience, p.conditions, p.basis].filter(Boolean),
    ].join(' — '))),
    price_items: prices, admission_type: row.admission_type, booking_kind: row.booking_kind,
    booking_status: row.booking_status, on_sale_at: timestamp(row.on_sale_at),
    source_id: source.id, source_name: source.name, source_url: source.url,
    source_event_urls: relations.sourceUrls,
  }
  return Object.fromEntries(fields.map(field => [field, result[field] ?? null]))
}
