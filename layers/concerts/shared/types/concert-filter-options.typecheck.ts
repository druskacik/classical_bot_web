import type {
  CityFilterOption, FilterOptionsRequest, FilterOptionsResponse, WorkFilterOption,
} from './concert-filter-options'

// Compile-only contract tests, included by both applications' shared typechecks.
type Assert<T extends true> = T
type Reject<T extends false> = T

type ValidRequest = Assert<{ type: 'city'; selected: string } extends FilterOptionsRequest ? true : false>
type ValidResponse = Assert<{ items: { value: string; label: string; count: number }[] } extends FilterOptionsResponse ? true : false>
type InvalidFacet = Reject<{ type: 'performer' } extends FilterOptionsRequest ? true : false>
type InvalidQuery = Reject<{ type: 'city'; includeUnavailable: boolean } extends FilterOptionsRequest ? true : false>
type InvalidCount = Reject<{ items: { value: string; label: string; count: string }[] } extends FilterOptionsResponse ? true : false>
type InvalidValue = Reject<{ items: { value: number; label: string; count: number }[] } extends FilterOptionsResponse ? true : false>
type InvalidCity = Reject<{ value: string; label: string; count: number } extends CityFilterOption ? true : false>
type InvalidWork = Reject<{ value: string; label: string; count: number } extends WorkFilterOption ? true : false>
type InvalidCityResponse = Reject<{ items: { value: string; label: string; count: number }[] } extends FilterOptionsResponse<'city'> ? true : false>
type InvalidWorkResponse = Reject<{ items: { value: string; label: string; count: number }[] } extends FilterOptionsResponse<'work'> ? true : false>
