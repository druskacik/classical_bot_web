// Concert dates are calendar dates; API UTC-midnight strings are not viewer-local instants.
export const concertCalendarDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value)) return null
  const calendarDate = value.slice(0, 10)
  const date = new Date(`${calendarDate}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === calendarDate ? calendarDate : null
}

export const formatConcertTime = timeString => {
  if (typeof timeString !== 'string') return null
  const match = timeString.match(/^(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : null
}

export const formatConcertDateTime = (dateString, timeString) => {
  const date = concertCalendarDate(dateString)
  const time = formatConcertTime(timeString)
  return date && time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? `${date}T${time}` : undefined
}

export const createConcertDateFormatting = (locale, unavailable = 'Date unavailable') => {
  const dayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const formatDate = value => {
    const date = concertCalendarDate(value)
    return date ? dayFormatter.format(new Date(`${date}T00:00:00Z`)) : unavailable
  }
  const groupByMonth = concerts => {
    const groups = {}
    const undated = []
    for (const concert of concerts) {
      const date = concertCalendarDate(concert.date)
      if (!date) {
        undated.push(concert)
        continue
      }
      const month = monthFormatter.format(new Date(`${date}T00:00:00Z`))
      if (!groups[month]) groups[month] = []
      groups[month].push(concert)
    }
    if (undated.length) groups[unavailable] = undated
    return groups
  }
  return { formatDate, groupByMonth }
}
