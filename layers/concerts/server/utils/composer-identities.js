// Published identities stay stable; catalogue-only identities remain live.
export const composerIdentities = db => db('serving.current_composer')
  .where('published', true).select('id', 'name', 'normalized_name')
  .unionAll(db('composer as c').select('c.id', 'c.name', 'c.normalized_name')
    .whereNotExists(db('serving.current_composer as p').select(db.raw('1'))
      .where('p.published', true).whereRaw('p.id = c.id')))
