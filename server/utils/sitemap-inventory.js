import knex from '#layers/concerts/server/utils/connection.js'
import { getCityCatalogue } from '#layers/concerts/server/utils/city-catalogue.js'
import { applyPublicConcertScope } from '#layers/concerts/server/utils/public-concerts.js'
import { buildSitemapInventory } from '#shared/utils/sitemap-inventory.js'
import { getComposerDirectory } from './composers.js'

export async function getSitemapInventory() {
  const [catalogue, counts, composers, composerSubjects, workSubjects] = await Promise.all([
    getCityCatalogue(),
    applyPublicConcertScope(knex('classical_concert as cc'))
      .select('cc.country_code_resolved', 'cc.city_id')
      .count('* as count')
      .groupBy('cc.country_code_resolved', 'cc.city_id'),
    getComposerDirectory(),
    subjectInventory('composer'),
    subjectInventory('work'),
  ])
  return buildSitemapInventory(catalogue, counts, composers, [...composerSubjects, ...workSubjects])
}

// Enumerate observed groups, never a location/subject cross-product. Name-based
// composer URLs must resolve uniquely across the entire composer table.
function subjectInventory(type) {
  const query = applyPublicConcertScope(knex('classical_concert as cc'))
    .select('cc.country_code_resolved', 'cc.city_id')
    .countDistinct('cc.id as count')
    .groupBy('cc.country_code_resolved', 'cc.city_id')
  if (type === 'composer') {
    query.join('classical_concert_composer as link', 'link.classical_concert_id', 'cc.id')
      .join('composer as c', 'c.id', 'link.composer_id')
      .select('c.id', 'c.name').groupBy('c.id', 'c.name')
      .whereRaw("btrim(c.name) <> '' AND c.name = btrim(c.name)")
      .whereNotIn('c.name', knex('composer').select('name').groupBy('name').havingRaw('count(*) > 1'))
  } else {
    query.join('classical_concert_work as link', 'link.classical_concert_id', 'cc.id')
      .join('work as w', 'w.id', 'link.work_id').join('composer as c', 'c.id', 'w.composer_id')
      .select('w.id').groupBy('w.id')
      .whereRaw("btrim(w.title) <> '' AND btrim(c.name) <> ''")
  }
  return query.then(rows => rows.map(row => ({ ...row, type })))
}
