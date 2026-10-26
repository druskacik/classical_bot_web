/** Serialized HTTP parameters; runtime validation remains on the server. */
export type FilterOptionType = 'country' | 'city' | 'composer' | 'work'

export interface FilterOptionsRequest<T extends FilterOptionType = FilterOptionType> {
  type: T
  q?: string
  selected?: string
  includeUnavailable?: string
  cityId?: string
  country?: string
  city?: string
  nearLat?: string
  nearLng?: string
  radius?: string
  bounds?: string
  dateFrom?: string
  dateTo?: string
  composers?: string
  works?: string
}

export interface NamedFilterOption {
  value: string
  label: string
  count: number
  country_code?: string
  secondaryLabel?: string
  radiusAvailable?: boolean
}

export interface CityFilterOption extends NamedFilterOption {
  radiusAvailable: boolean
}

export interface WorkFilterOption extends NamedFilterOption {
  secondaryLabel: string
}

export interface FilterOptionByType {
  country: NamedFilterOption
  city: CityFilterOption
  composer: NamedFilterOption
  work: WorkFilterOption
}

export type FilterOption = FilterOptionByType[FilterOptionType]
export interface FilterOptionsResponse<T extends FilterOptionType = FilterOptionType> {
  items: FilterOptionByType[T][]
}
