import { composerIdentities } from './composer-identities.js'
import { composerProfilePath } from '../../shared/utils/subject-discovery.js'

export async function resolveDiscoverySubject(db, filters) {
  // Filters already passed the common API parser. Preserve its exact-name semantics.
  const selection = filters.composers.length === 1 && !filters.works.length ? { type: 'composer' }
    : filters.works.length === 1 && !filters.composers.length ? { type: 'work', value: filters.works[0] } : null
  if (!selection) return { status: 'unsupported', subject: null }
  if (selection.type === 'composer') {
    const rows = await db.from(composerIdentities(db).as('c'))
      .select('c.id', 'c.name').where('c.name', filters.composers[0]).limit(2)
    if (!rows.length) return { status: 'unknown', subject: null }
    if (rows.length > 1) return { status: 'ambiguous', subject: null }
    const composer = rows[0]
    if (!composer.name?.trim()) return { status: 'unsupported', subject: null }
    const playlist = await db('composer_spotify_playlist').select('id').where('composer_id', composer.id)
      .where('status', 'published').where('is_public', true)
      .whereRaw("spotify_playlist_id ~ '^[A-Za-z0-9]{22}$'").first()
    return { status: 'resolved', subject: { type: 'composer', id: composer.id, name: composer.name,
      profilePath: playlist ? composerProfilePath(composer.id, composer.name) : null } }
  }
  const work = await db('work as w').leftJoin(composerIdentities(db).as('c'), 'c.id', 'w.composer_id')
    .select('w.id', 'w.title', 'w.catalogue_number', 'c.name as composer_name').where('w.id', selection.value).first()
  if (!work) return { status: 'unknown', subject: null }
  if (!work.title?.trim() || !work.composer_name?.trim()) return { status: 'unsupported', subject: null }
  return { status: 'resolved', subject: { type: 'work', id: work.id, title: work.title,
    composerName: work.composer_name, catalogueNumber: work.catalogue_number } }
}
