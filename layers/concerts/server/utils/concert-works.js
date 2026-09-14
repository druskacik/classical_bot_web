export function groupConcertWorks(rows) {
  const concerts = new Map()
  for (const row of rows) {
    const key = String(row.classical_concert_id)
    if (!concerts.has(key)) concerts.set(key, new Map())
    concerts.get(key).set(String(row.id), {
      id: row.id,
      title: row.title,
      composer: row.composer_id == null ? null : { id: row.composer_id, name: row.composer_name },
    })
  }
  return new Map([...concerts].map(([id, works]) => [id, [...works.values()].sort((a, b) =>
    (a.composer?.name || '').localeCompare(b.composer?.name || '', 'en')
    || a.title.localeCompare(b.title, 'en') || Number(a.id) - Number(b.id),
  )]))
}
