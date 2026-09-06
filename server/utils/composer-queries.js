import { applyPublicConcertScope } from '../../layers/concerts/server/utils/public-concerts.js'

export const publishedPlaylists = db => db('composer_spotify_playlist as p')
  .distinctOn('p.composer_id')
  .join('composer as c', 'c.id', 'p.composer_id')
  .select('c.id', 'c.name', 'p.id as playlist_id', 'p.spotify_playlist_id',
    db.raw('p.season_start::text as season_start'), db.raw('p.season_end::text as season_end'))
  .where('p.status', 'published').where('p.is_public', true)
  .whereRaw("p.spotify_playlist_id ~ '^[A-Za-z0-9]{22}$'")
  .orderBy('p.composer_id').orderBy('p.season_start', 'desc')
  .orderBy('p.last_synced_at', 'desc', 'last').orderBy('p.id', 'desc')

export const composerCounts = (db, ids) => applyPublicConcertScope(db('classical_concert as cc'))
  .join('classical_concert_composer as ccc', 'ccc.classical_concert_id', 'cc.id')
  .whereIn('ccc.composer_id', ids).select('ccc.composer_id')
  .countDistinct('cc.id as count').groupBy('ccc.composer_id')

export const rankedWorks = (db, id) => applyPublicConcertScope(db('classical_concert as cc'))
  .join('classical_concert_work as ccw', 'ccw.classical_concert_id', 'cc.id')
  .join('work as w', 'w.id', 'ccw.work_id').where('w.composer_id', id)
  .select('w.id', 'w.title', 'w.catalogue_number').countDistinct('cc.id as count')
  .groupBy('w.id', 'w.title', 'w.catalogue_number')
  .orderBy('count', 'desc').orderBy('w.title').orderBy('w.id').limit(20)
