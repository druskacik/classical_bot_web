// Map results are a preview; keep full programmes on the concert source page.
export function mapProgramme(composers = [], works = []) {
  const key = composer => composer?.id == null ? composer?.name || 'unknown' : String(composer.id)
  const groups = new Map()
  for (const composer of [...composers, ...works.map(work => work.composer)].filter(Boolean)) {
    if (!groups.has(key(composer))) groups.set(key(composer), { composer, works: [] })
  }
  for (const work of works) {
    if (!groups.has(key(work.composer))) groups.set(key(work.composer), { composer: null, works: [] })
    groups.get(key(work.composer)).works.push(work)
  }
  const names = [...groups.values()].filter(group => group.composer).map(group => group.composer.name)
  if (names.length > 3 || !works.length) return { names, rows: [], omitted: 0 }
  // Give each composer a line before adding further works by the same composer.
  const rows = [...groups.values()].map(group => ({ composer: group.composer?.name || '', work: group.works[0]?.title || '' })).slice(0, 3)
  for (const group of groups.values()) {
    for (const work of group.works.slice(1)) {
      if (rows.length < 3) rows.push({ composer: group.composer?.name || '', work: work.title })
    }
  }
  const shown = rows.filter(row => row.work).length
  return { names: [], rows, omitted: Math.max(0, works.length - shown) }
}
