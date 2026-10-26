import type { Knex } from 'knex'
import type { FilterOptionType } from '../../../shared/types/concert-filter-options'

export interface Site { country: string | null; locale: string }
export type DatabaseId = string | number
export type DatabaseCount = string | number

export interface IdentityCity {
  id: DatabaseId
  english_name: string | null
  local_name: string | null
  display_name?: string | null
  country_code: string
  latitude?: number | null
  longitude?: number | null
}

export interface CitySelection {
  id: number | null
  name: string | null
  country: string | null
  canonicalId?: string
  countryCode?: string
  aliases?: string[]
}

export interface ResolvedFilters {
  country: string | null
  siteCountry?: string
  city: CitySelection | null
  dateFrom: string | null
  dateTo: string | null
  composers: string[]
  works: number[]
  bounds?: { west: number; south: number; east: number; north: number }
  area?: {
    origin?: string
    cityId?: string
    latitude: number
    longitude: number
    radiusKm: number
    label: string | null
    countryCode?: string
    cityIds: string[]
    unresolvedCity?: { countryCode: string; names: string[] }
  }
}

export interface CityIdentities {
  resolve(selection: Pick<CitySelection, 'name' | 'country'> & { id?: number | null } | null): IdentityCity | null
  uniqueAliases(city: IdentityCity): string[]
}

export interface PreparedRequest {
  type: FilterOptionType
  context: ResolvedFilters
  search: string
  selected: string[]
  includeUnavailable: boolean
  identityCities: IdentityCity[]
  identities: CityIdentities
}

/** Database projections and restored labels before response normalization. */
export interface OptionRow {
  value: DatabaseId
  label: string
  count?: DatabaseCount
  country_code?: string
  secondaryLabel?: string
  radiusAvailable?: boolean
}
export interface CountRow { value: DatabaseId; count: DatabaseCount }
export interface CityCountRow { id: DatabaseId; count: DatabaseCount }
export interface RawCityRow { name: string; label: string; country_code: string; count: DatabaseCount }
export interface RankedCityOption extends OptionRow { value: string; count: number; searchRank: number }
export interface LoaderResult { suggestions: OptionRow[]; selectedOptions: OptionRow[] }
export interface LoaderInput { db: Knex.Transaction; request: PreparedRequest; site: Site }
