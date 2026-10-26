import { installResolvedFixture, publishResolvedFixture } from './resolved-fixture.js'

export async function seedComposers(db) {
  await db.raw(`
    CREATE TABLE crawler_source(id bigint primary key, canonical_url text, duplicate_of_id bigint);
    CREATE TABLE crawler_source_url(crawler_source_id bigint, url text);
    CREATE TABLE city(id bigint primary key, english_name text, local_name text, display_name text,
      country_code text, latitude double precision, longitude double precision);
    CREATE TABLE composer(id int primary key, name text);
    CREATE TABLE composer_spotify_playlist(id int primary key, composer_id int, status text, is_public boolean,
      spotify_playlist_id text, season_start date, season_end date, last_synced_at timestamptz);
    CREATE TABLE composer_spotify_playlist_item(playlist_id int);
    CREATE TABLE classical_concert(id int primary key, source_url text, date date, inclusion_status text, duplicate_of_id int);
    CREATE TABLE classical_concert_composer(classical_concert_id int, composer_id int, UNIQUE(classical_concert_id, composer_id));
    CREATE TABLE work(id int primary key, title text, catalogue_number text, composer_id int);
    CREATE TABLE classical_concert_work(classical_concert_id int, work_id int);
    INSERT INTO crawler_source VALUES (1,'https://one.test/',NULL),(2,'https://old.test/',1),(3,'https://older.test/',2);
    INSERT INTO crawler_source_url VALUES (3,'https://alias.test/');
    INSERT INTO composer VALUES (1,'Target'),(2,'Alpha'),(3,'Beta'),(4,'No pair'),(5,'Hidden'),(6,'Alpha');
    INSERT INTO composer_spotify_playlist
      SELECT id,id,'published',id<>5,'1234567890123456789012','2026-07-01','2027-07-01',NULL FROM composer;
    INSERT INTO classical_concert VALUES
      (1,'https://one.test/',CURRENT_DATE,'included',NULL),
      (2,'https://old.test/',CURRENT_DATE+1,'included',NULL),
      (3,'https://alias.test',CURRENT_DATE+2,'included',NULL),
      (4,'https://two.test/',CURRENT_DATE,'included',NULL),
      (5,' https://two.test ',CURRENT_DATE+1,'included',NULL),
      (6,'https://one.test/',CURRENT_DATE,'included',NULL),
      (7,NULL,CURRENT_DATE,'included',NULL),
      (8,'https://past.test/',CURRENT_DATE-1,'included',NULL),
      (9,'https://excluded.test/',CURRENT_DATE,'excluded',NULL),
      (10,'https://duplicate.test/',CURRENT_DATE,'included',1),
      (11,' ',CURRENT_DATE,'included',NULL);
    INSERT INTO classical_concert_composer VALUES
      (1,1),(1,2),(1,3),(1,5),(1,6),
      (2,1),(2,2),(3,1),(3,2),
      (4,2),(5,2),(6,4),
      (7,1),(7,4),(8,1),(8,4),(9,1),(9,4),(10,1),(10,4),(11,1),(11,4);
  `)
  await installResolvedFixture(db, { populate: false })
  await db('classical_concert').update({ title: 'Programme' })
  await publishResolvedFixture(db)
}
