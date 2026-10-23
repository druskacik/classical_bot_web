-- serving projection: concert
INSERT INTO serving.concert
SELECT %(g)s,c.id,c.date,c.time_from,c.time_to,c.title,c.url,c.type,c.venue,c.venue_id,c.city_id,
 c.city_raw,c.country_code_raw,c.country_code_resolved,c.event_status,c.admission_type,
 display.value->>'source',display.value->>'source_url'
FROM resolved_concert c LEFT JOIN LATERAL (
 SELECT entry AS value FROM jsonb_array_elements(c.sources) entry
 ORDER BY (entry->>'concert_id')::bigint=c.id DESC,(entry->>'concert_id')::bigint LIMIT 1
) display ON true;

-- serving projection: member
INSERT INTO serving.member
SELECT %(g)s,member_id,concert_id,eligible FROM resolved_concert_member;

-- serving projection: occurrence
INSERT INTO serving.occurrence
SELECT %(g)s,m.member_id,m.concert_id,c.date,(m.data->>'date')::date,m.data->>'source_url',
 n.normalized_url,m.data->>'source',m.data->>'url'
FROM resolved_concert_member m JOIN resolved_concert c ON c.id=m.concert_id
LEFT JOIN serving_url_normalization n ON n.raw_url=m.data->>'source_url'
WHERE m.eligible;
-- serving projection: source_summary
INSERT INTO serving.source_summary
SELECT DISTINCT ON(normalized_url) %(g)s,normalized_url,source,member_date,member_id
FROM serving.occurrence WHERE generation_id=%(g)s AND normalized_url IS NOT NULL AND NULLIF(btrim(source),'') IS NOT NULL
ORDER BY normalized_url,member_date DESC NULLS FIRST,member_id DESC;

-- serving projection: composer
INSERT INTO serving.composer
SELECT %(g)s,id,name,normalized_name,true FROM (
 SELECT DISTINCT ON(composer_id) composer_id AS id,composer->>'name' AS name,
 composer->>'normalized_name' AS normalized_name FROM resolved_concert_composer ORDER BY composer_id,concert_id
) published;
-- serving projection: composer supplement
INSERT INTO serving.composer
SELECT %(g)s,id,name,normalized_name,false FROM composer c WHERE NOT EXISTS(
 SELECT 1 FROM serving.composer p WHERE p.generation_id=%(g)s AND p.id=c.id);
-- serving projection: work
INSERT INTO serving.work
SELECT %(g)s,work_id,composer_id,work->>'title',work->>'normalized_title',work->>'catalogue_number'
FROM (SELECT DISTINCT ON(work_id) * FROM resolved_concert_work ORDER BY work_id,concert_id) w;
-- serving projection: work supplement
INSERT INTO serving.work
SELECT %(g)s,id,composer_id,title,normalized_title,catalogue_number FROM work w
WHERE NOT EXISTS(SELECT 1 FROM serving.work s WHERE s.generation_id=%(g)s AND s.id=w.id);
-- serving projection: concert_composer
INSERT INTO serving.concert_composer
SELECT %(g)s,concert_id,composer_id,composer->>'name' FROM resolved_concert_composer;
-- serving projection: concert_work
INSERT INTO serving.concert_work
SELECT %(g)s,concert_id,work_id,composer_id,programme_label FROM resolved_concert_work;
-- serving projection: concert_performer
INSERT INTO serving.concert_performer
SELECT %(g)s,concert_id,performer_id FROM resolved_concert_performer;

-- serving projection: documents
WITH performers AS (
 SELECT concert_id,jsonb_agg(jsonb_build_object(
 'classical_concert_id',concert_id,'id',performer_id::text,'name',performer->>'name','kind',performer->>'kind',
 'identity_url',performer->>'identity_url','roles',roles,'instruments',instruments,
 'voice_type',voice_type,'character_name',character_name,'ensemble_id',ensemble_id::text,
 'qualifier',qualifier,'display_order',display_order) ORDER BY display_order,performer_id) AS value
 FROM resolved_concert_performer GROUP BY concert_id
), works AS (
 SELECT w.concert_id,jsonb_agg(jsonb_build_object(
 'classical_concert_id',w.concert_id,'id',w.work_id,'composer_id',w.composer_id,
 'programme_label',w.programme_label,'title',w.work->>'title','catalogue_number',w.work->>'catalogue_number',
 'composer_name',c.composer->>'name') ORDER BY c.composer->>'name',w.work->>'title',w.work_id) AS value
 FROM resolved_concert_work w LEFT JOIN resolved_concert_composer c USING(concert_id,composer_id)
 GROUP BY w.concert_id
), composers AS (
 SELECT concert_id,jsonb_agg(jsonb_build_object('classical_concert_id',concert_id,'id',composer_id,'name',composer->>'name')
 ORDER BY composer->>'name',composer_id) AS value FROM resolved_concert_composer GROUP BY concert_id
), prices AS (
 SELECT concert_id,jsonb_agg((offer-'source_url')||jsonb_build_object('id',offer_id::text,'classical_concert_id',concert_id,'amount',offer->>'amount','amount_max',offer->>'amount_max')
 ORDER BY offer_id) AS value FROM resolved_concert_ticket_price GROUP BY concert_id
)
INSERT INTO serving.concert_document
SELECT %(g)s,c.id,(to_jsonb(c)-'provenance'-'conflicts'-'sources') || jsonb_build_object(
 'last_verified_at',m.data->>'last_verified_at','venue_id',c.venue_id::text,'city_id',c.city_id::text,'venue_details',
 (SELECT jsonb_object_agg(key,CASE WHEN key IN ('id','parent_venue_id') THEN to_jsonb(value#>>'{}') ELSE value END) FROM jsonb_each(COALESCE(c.venue_details,'{}'))
 WHERE key IN ('id','name','address','identity_url','latitude','longitude','parent_venue_id'))),
 COALESCE(p.value,'[]'),COALESCE(w.value,'[]'),COALESCE(co.value,'[]'),COALESCE(pr.value,'[]')
FROM resolved_concert c JOIN resolved_concert_member m ON m.member_id=c.id
LEFT JOIN performers p ON p.concert_id=c.id LEFT JOIN works w ON w.concert_id=c.id
LEFT JOIN composers co ON co.concert_id=c.id LEFT JOIN prices pr ON pr.concert_id=c.id;

-- A concert contributes once per public name, even if multiple IDs share that name.
-- serving projection: facets
WITH members AS (
 SELECT DISTINCT 'composer'::text AS kind,l.name AS value,c.id,c.date,c.country_code_resolved AS country
 FROM serving.concert_composer l JOIN serving.concert c ON (c.generation_id,c.id)=(l.generation_id,l.concert_id)
 WHERE c.generation_id=%(g)s AND l.name IS NOT NULL
 UNION ALL
 SELECT 'work',l.work_id::text,c.id,c.date,c.country_code_resolved FROM serving.concert_work l
 JOIN serving.concert c ON (c.generation_id,c.id)=(l.generation_id,l.concert_id) WHERE c.generation_id=%(g)s
 UNION ALL
 SELECT 'city',city_id::text,id,date,country_code_resolved FROM serving.concert
 WHERE generation_id=%(g)s AND city_id IS NOT NULL
 UNION ALL
 SELECT 'country',country_code_resolved,id,date,country_code_resolved FROM serving.concert
 WHERE generation_id=%(g)s AND country_code_resolved IS NOT NULL
)
INSERT INTO serving.facet_daily
SELECT %(g)s,kind,value,date,'global','',count(*) FROM members WHERE date IS NOT NULL GROUP BY kind,value,date
UNION ALL
SELECT %(g)s,kind,value,date,'country',country,count(*) FROM members WHERE date IS NOT NULL AND country IS NOT NULL
GROUP BY kind,value,date,country;
-- serving projection: raw_city_daily
INSERT INTO serving.raw_city_daily
SELECT %(g)s,lower(city_raw),min(city_raw),COALESCE(country_code_resolved,country_code_raw),COALESCE(country_code_resolved,''),COALESCE(date,'-infinity'::date),count(*)
FROM serving.concert WHERE generation_id=%(g)s AND city_id IS NULL AND city_raw IS NOT NULL
 AND COALESCE(country_code_resolved,country_code_raw) IS NOT NULL
GROUP BY lower(city_raw),COALESCE(country_code_resolved,country_code_raw),COALESCE(country_code_resolved,''),date;

-- serving projection: diagnostics
WITH evidence AS (
 SELECT concert_id,'performer' AS kind,to_jsonb(p) AS payload FROM resolved_concert_performer p
 UNION ALL SELECT concert_id,'work',to_jsonb(w) FROM resolved_concert_work w
 UNION ALL SELECT concert_id,'composer',to_jsonb(c) FROM resolved_concert_composer c
 UNION ALL SELECT concert_id,'price',to_jsonb(p) FROM resolved_concert_ticket_price p
), grouped AS (
 SELECT concert_id,jsonb_agg(jsonb_build_object('kind',kind,'data',payload) ORDER BY kind,payload::text) AS relations
 FROM evidence GROUP BY concert_id
)
INSERT INTO serving.diagnostic
SELECT %(g)s,c.id,jsonb_build_object('provenance',c.provenance,'conflicts',c.conflicts,'relations',COALESCE(g.relations,'[]'))
FROM resolved_concert c LEFT JOIN grouped g ON g.concert_id=c.id;
