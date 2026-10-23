// Shared identity set for name-valued filters, navigation, subject resolution
// and ambiguity checks. Callers pass their resolved read transaction.
// Deduplicate snapshots by canonical ID independently of date/site/search scope;
// live registry identities supplement only IDs absent from the publication.
// A live rename cannot change a published composer's name until republication.
export function composerIdentities(db) {
  const published = db('resolved_concert_composer as published_composer')
    .distinctOn('published_composer.composer_id')
    .select('published_composer.composer_id as id',
      db.raw("published_composer.composer->>'name' as name"),
      db.raw("published_composer.composer->>'normalized_name' as normalized_name"))
    .orderBy('published_composer.composer_id').orderBy('published_composer.concert_id')

  return db.with('published_composer_identities', published)
    .from('published_composer_identities').select('id', 'name', 'normalized_name')
    .unionAll(db('composer as registry').select('registry.id', 'registry.name', 'registry.normalized_name')
      .whereNotExists(db('published_composer_identities as published').select(1)
        .whereRaw('published.id = registry.id')))
}
