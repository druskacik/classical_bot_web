// Inputs have already passed endpoint validation. Keep key normalization separate
// from query inputs: set-like filters can be sorted without changing result order.
export const concertFilterCacheInput = filters => ({
  country: filters.country,
  siteCountry: filters.siteCountry || null,
  city: filters.city,
  dateFrom: filters.dateFrom,
  dateTo: filters.dateTo,
  composers: [...new Set(filters.composers)].sort(),
  works: [...new Set(filters.works)].sort((a, b) => a - b),
})

export const siteDataCacheKey = (site, input) => JSON.stringify([
  site.country || null, site.locale, site.cityRoutes, input,
])
