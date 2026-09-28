// Missing relationships are empty; preserve every supplied non-null entry.
export const normalizeProgrammeItems = value => Array.isArray(value) ? value.filter(item => item != null) : []
