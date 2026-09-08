import knex from '#layers/concerts/server/utils/connection.js'
import { composerPath, seasonLabel, catalogueLabel } from '#shared/utils/composers.js'
import { publishedPlaylists, composerCounts, rankedWorks } from './composer-queries.js'

const coverComposers = new Set([1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 16, 18, 20, 29, 34, 39, 41, 49, 67])

export const getComposerDirectory = defineCachedFunction(async () => {
  const playlists = await publishedPlaylists(knex)
  if (!playlists.length) return []
  const [counts, tracks] = await Promise.all([
    composerCounts(knex, playlists.map(p => p.id)),
    knex('composer_spotify_playlist_item').select('playlist_id').count('* as count')
      .whereIn('playlist_id', playlists.map(p => p.playlist_id)).groupBy('playlist_id'),
  ])
  const countMap = new Map(counts.map(row => [Number(row.composer_id), Number(row.count)]))
  const trackMap = new Map(tracks.map(row => [String(row.playlist_id), Number(row.count)]))
  return playlists.map(p => ({
    id: p.id, name: p.name, path: composerPath(p.id, p.name),
    concertCount: countMap.get(p.id) || 0,
    cover: coverComposers.has(p.id) && p.season_start === '2026-07-01' && p.season_end === '2027-07-01'
      ? `/composers/2026-27/${p.id}` : null,
    playlist: {
      id: p.spotify_playlist_id,
      url: `https://open.spotify.com/playlist/${p.spotify_playlist_id}`,
      season: seasonLabel(p.season_start, p.season_end),
      trackCount: trackMap.get(String(p.playlist_id)) || 0,
    },
  })).sort((a, b) => b.concertCount - a.concertCount || a.name.localeCompare(b.name, 'en') || a.id - b.id)
}, { name: 'composer-directory', maxAge: 300, swr: false })

export const getComposerWorks = defineCachedFunction(async (id) => {
  const works = await rankedWorks(knex, id)
  return works.map(work => ({ id: work.id, title: work.title,
    catalogue: catalogueLabel(work.title, work.catalogue_number), concertCount: Number(work.count) }))
}, { name: 'composer-works', maxAge: 300, swr: false, getKey: id => String(id) })
