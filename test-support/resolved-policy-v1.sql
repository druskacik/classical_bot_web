-- Frozen policy v1. Changes require a new migration.
CREATE TABLE resolved_concert_refresh_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    policy_version integer NOT NULL DEFAULT 1,
    snapshot_at timestamptz, published_at timestamptz,
    duration_seconds double precision, row_counts jsonb,
    integrity_count bigint, conflict_count bigint,
    last_attempt_at timestamptz, last_failure_at timestamptz, last_error text
);
INSERT INTO resolved_concert_refresh_state(singleton) VALUES (true);

CREATE FUNCTION resolved_v1_allowed(states jsonb, field text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT NOT COALESCE((states->field->>'requires_revalidation')::boolean,false)
    AND COALESCE(states->field->>'status','') <> 'not_applicable'
    AND COALESCE(states->field->'accepted_result'->>'status','') <> 'not_applicable'
$$;
CREATE FUNCTION resolved_v1_tier(states jsonb, field text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE states->field->'accepted_result'->>'status'
    WHEN 'complete' THEN 0 WHEN 'composer_only' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END
$$;

CREATE MATERIALIZED VIEW resolved_concert_member AS
WITH RECURSIVE tree AS (
 SELECT id, id AS concert_id FROM classical_concert WHERE duplicate_of_id IS NULL
 UNION ALL
 SELECT c.id,t.concert_id FROM tree t JOIN classical_concert c ON c.duplicate_of_id=t.id
), states AS (
 SELECT classical_concert_id, jsonb_object_agg(field_group,jsonb_build_object('status',s.status,'requires_revalidation',s.requires_revalidation,
     'accepted_result',s.accepted_result,'accepted_at',s.accepted_at,'accepted_model',s.accepted_model,
     'inherited_from_concert_id',s.inherited_from_concert_id)) AS value
 FROM concert_extraction_state s GROUP BY classical_concert_id
)
SELECT c.id AS member_id,t.concert_id,c.inclusion_status='included' AS eligible,
       to_jsonb(c)-'updated_at'-'created_at'-'is_concert_details_filled'-'program_analysis_eligible' AS data,
       CASE WHEN vs.inherited_from_concert_id IS NOT NULL AND NOT COALESCE(
           dt.concert_id=t.concert_id AND donor.inclusion_status='included'
           AND ds.inherited_from_concert_id IS NULL AND ds.accepted_result IS NOT NULL
           AND NOT ds.requires_revalidation AND ds.status <> 'not_applicable'
           AND ds.accepted_result->>'status'='complete'
           AND ds.accepted_at IS NOT NULL AND NULLIF(ds.accepted_model,'') IS NOT NULL
           AND NULLIF(ds.accepted_result->>'source_url','') IS NOT NULL
           AND NULLIF(ds.accepted_result->>'evidence','') IS NOT NULL
           AND ds.accepted_result->'place'->>'existing_id'=donor.venue_id::text
           AND donor.venue_id=c.venue_id
           AND NOT COALESCE((dst.value->'location'->>'requires_revalidation')::boolean,false),false)
        THEN jsonb_set(COALESCE(s.value,'{}'),'{venue}',
             COALESCE(s.value->'venue','{}') || '{"requires_revalidation":true,"resolved_inheritance_invalid":true}'::jsonb)
        ELSE COALESCE(s.value,'{}') END AS states,
       to_jsonb(v) AS venue_data
FROM tree t JOIN classical_concert c ON c.id=t.id
JOIN classical_concert root ON root.id=t.concert_id AND root.inclusion_status='included'
LEFT JOIN states s ON s.classical_concert_id=c.id
LEFT JOIN venue v ON v.id=c.venue_id
LEFT JOIN concert_extraction_state vs ON vs.classical_concert_id=c.id AND vs.field_group='venue'
LEFT JOIN classical_concert donor ON donor.id=vs.inherited_from_concert_id
LEFT JOIN tree dt ON dt.id=donor.id
LEFT JOIN states dst ON dst.classical_concert_id=donor.id
LEFT JOIN concert_extraction_state ds ON ds.classical_concert_id=donor.id AND ds.field_group='venue'
WITH NO DATA;
CREATE UNIQUE INDEX resolved_member_pk ON resolved_concert_member(member_id);
CREATE INDEX resolved_member_group ON resolved_concert_member(concert_id,member_id);

-- A narrow candidate relation centralizes eligibility, precedence and provenance.
CREATE VIEW resolved_concert_candidate AS
SELECT m.concert_id,m.member_id,f.field,f.value,f.evidence_group,
       resolved_v1_tier(m.states,f.evidence_group) AS tier,
       (m.states->f.evidence_group->>'accepted_at')::timestamptz AS accepted_at,
       jsonb_build_object('concert_id',m.member_id,'source_url',m.data->'source_url',
         'url',m.data->'url','value',f.value,'accepted',m.states->f.evidence_group,
         'inherited_from_concert_id',m.states->f.evidence_group->'inherited_from_concert_id') AS evidence
FROM resolved_concert_member m
JOIN resolved_concert_member root ON root.member_id=m.concert_id
CROSS JOIN LATERAL (VALUES
 ('title',to_jsonb(NULLIF(btrim(m.data->>'title'),'')),'basic'),
 ('description',to_jsonb(NULLIF(btrim(m.data->>'description'),'')),'basic'),
 ('type',to_jsonb(NULLIF(btrim(m.data->>'type'),'')),'basic'),
 ('url',to_jsonb(NULLIF(btrim(m.data->>'url'),'')),'basic'),
 ('time_from', CASE WHEN m.data->>'date'=root.data->>'date'
    AND (root.data->>'time_from' IS NULL OR m.data->>'time_from' IS NULL
      OR abs(extract(epoch FROM (m.data->>'time_from')::time-(root.data->>'time_from')::time))<=3600)
    THEN m.data->'time_from' END,'basic'),
 ('time_to',CASE WHEN m.data->>'date'=root.data->>'date'
    AND (root.data->>'time_from' IS NULL OR m.data->>'time_from' IS NULL
      OR abs(extract(epoch FROM (m.data->>'time_from')::time-(root.data->>'time_from')::time))<=3600)
    THEN m.data->'time_to' END,'basic'),
 ('location',CASE WHEN resolved_v1_allowed(m.states,'location') AND (
      m.member_id=m.concert_id OR NOT resolved_v1_allowed(root.states,'location') OR (
        (root.data->>'city_id' IS NULL OR m.data->>'city_id'=root.data->>'city_id') AND
        (root.data->>'country_code_resolved' IS NULL OR m.data->>'country_code_resolved'=root.data->>'country_code_resolved')
      )) THEN
      CASE WHEN m.venue_data IS NOT NULL AND resolved_v1_allowed(m.states,'venue')
        AND m.venue_data->>'city_id'=m.data->>'city_id'
        AND m.venue_data->>'country_code'=m.data->>'country_code_resolved'
        AND (m.member_id=m.concert_id OR (
          m.states->'venue'->'accepted_result'->>'status'='complete'
          AND m.states->'venue'->>'accepted_at' IS NOT NULL
          AND NULLIF(m.states->'venue'->>'accepted_model','') IS NOT NULL
          AND NULLIF(m.states->'venue'->'accepted_result'->>'source_url','') IS NOT NULL
          AND NULLIF(m.states->'venue'->'accepted_result'->>'evidence','') IS NOT NULL
          AND m.states->'venue'->'accepted_result'->'place'->>'existing_id'=m.data->>'venue_id'))
      THEN jsonb_build_object('venue_id',m.data->'venue_id','venue',m.venue_data->'name',
         'city_id',m.venue_data->'city_id','country_code_resolved',m.venue_data->'country_code',
         'city_raw',m.data->'city_raw','country_code_raw',m.data->'country_code_raw','venue_details',m.venue_data)
      WHEN m.data->>'city_id' IS NOT NULL OR m.data->>'city_raw' IS NOT NULL
        OR NULLIF(btrim(m.data->>'country_code_resolved'),'') IS NOT NULL
        OR NULLIF(btrim(m.data->>'country_code_raw'),'') IS NOT NULL
        OR (resolved_v1_allowed(m.states,'venue') AND NULLIF(btrim(m.data->>'venue'),'') IS NOT NULL)
      THEN jsonb_build_object('venue_id',NULL,'venue',CASE WHEN resolved_v1_allowed(m.states,'venue') THEN NULLIF(btrim(m.data->>'venue'),'') END,
         'city_id',m.data->'city_id','country_code_resolved',m.data->'country_code_resolved',
         'city_raw',m.data->'city_raw','country_code_raw',m.data->'country_code_raw') END END,'venue'),
 ('purchase',CASE WHEN m.data->>'buy_url' IS NOT NULL OR m.data->>'booking_status' NOT IN ('unknown','')
     THEN jsonb_build_object('buy_url',m.data->'buy_url','booking_kind',m.data->'booking_kind',
         'booking_status',m.data->'booking_status','on_sale_at',m.data->'on_sale_at') END,'purchase_link'),
 ('admission_type',m.data->'admission_type','pricing'),
 ('event_status',m.data->'event_status','event_status')
) AS f(field,value,evidence_group)
WHERE m.eligible AND f.value IS NOT NULL AND f.value <> 'null'::jsonb
 AND (resolved_v1_allowed(m.states,CASE WHEN f.field='location' THEN 'location' ELSE f.evidence_group END)
      OR (f.field='purchase' AND NOT COALESCE((m.states->'purchase_link'->>'requires_revalidation')::boolean,false)
          AND m.data->>'buy_url' IS NULL AND m.data->>'booking_status' IN ('box_office_only','not_required')));

-- Resolve each small group independently: sorting all wide provenance records
-- across the catalogue requires excessive temporary storage at production scale.
CREATE MATERIALIZED VIEW resolved_concert AS
SELECT r.member_id AS id,(r.data->>'date')::date AS date,
 p.value->>'title' AS title,p.value->>'description' AS description,p.value->>'type' AS type,p.value->>'url' AS url,
 (p.value->>'time_from')::time AS time_from,
 CASE WHEN p.value->>'time_from' IS NULL OR (p.value->>'time_to')::time >= (p.value->>'time_from')::time
     THEN (p.value->>'time_to')::time END AS time_to,
 (p.value->'location'->>'venue_id')::bigint AS venue_id,p.value->'location'->>'venue' AS venue,
 (p.value->'location'->>'city_id')::bigint AS city_id,
 p.value->'location'->>'country_code_resolved' AS country_code_resolved,
 p.value->'location'->>'city_raw' AS city_raw,p.value->'location'->>'country_code_raw' AS country_code_raw,
 p.value->'location'->'venue_details' AS venue_details,
 p.value->'purchase'->>'buy_url' AS buy_url,p.value->'purchase'->>'booking_kind' AS booking_kind,
 p.value->'purchase'->>'booking_status' AS booking_status,
 (p.value->'purchase'->>'on_sale_at')::timestamptz AS on_sale_at,
 p.value->>'admission_type' AS admission_type,p.value->>'event_status' AS event_status,
 s.value AS sources,p.provenance || jsonb_build_object('date',jsonb_build_object('concert_id',r.member_id,'value',r.data->'date')) AS provenance,
 COALESCE(p.conflicts,'{}') || CASE WHEN assertions.value IS NOT NULL THEN jsonb_build_object('field_assertions',assertions.value) ELSE '{}'::jsonb END || CASE WHEN s.date_conflict OR s.time_conflict OR s.location_conflict
     OR (p.value->>'time_to')::time < (p.value->>'time_from')::time
     THEN jsonb_build_object('occurrence',s.occurrence_evidence) ELSE '{}'::jsonb END AS conflicts
FROM resolved_concert_member r
CROSS JOIN LATERAL (
 WITH ranked AS (
   SELECT c.*,row_number() OVER (PARTITION BY c.field ORDER BY
     CASE WHEN c.field='event_status' THEN (m.data->>'event_status_updated_at')::timestamptz
          WHEN c.field='purchase' THEN c.accepted_at END DESC NULLS LAST,
     CASE WHEN c.field='location' THEN c.value->>'venue_id' IS NULL ELSE false END,
     c.member_id=c.concert_id DESC,c.tier,c.accepted_at DESC NULLS LAST,c.member_id) AS pos
   FROM resolved_concert_candidate c JOIN resolved_concert_member m ON m.member_id=c.member_id
   WHERE c.concert_id=r.member_id AND EXISTS (
     SELECT 1 FROM resolved_concert_member sibling
     WHERE sibling.concert_id=r.member_id AND sibling.eligible AND sibling.member_id<>r.member_id)
 ), fields AS (
   SELECT field,(jsonb_agg(value ORDER BY pos)->0) AS value,
     (jsonb_agg(evidence ORDER BY pos)->0) AS evidence,
     CASE WHEN count(DISTINCT value)>1 THEN jsonb_agg(evidence ORDER BY member_id) END AS alternatives
   FROM ranked GROUP BY field
 )
 SELECT jsonb_object_agg(field,value) AS value,jsonb_object_agg(field,evidence) AS provenance,
    jsonb_object_agg(field,alternatives) FILTER (WHERE alternatives IS NOT NULL) AS conflicts
 FROM fields HAVING count(*)>0
 UNION ALL
 -- A singleton has neither competing values nor donor precedence to resolve.
 SELECT jsonb_object_agg(c.field,c.value),jsonb_object_agg(c.field,c.evidence),'{}'::jsonb
 FROM resolved_concert_candidate c
 WHERE c.member_id=r.member_id AND NOT EXISTS (
   SELECT 1 FROM resolved_concert_member sibling
   WHERE sibling.concert_id=r.member_id AND sibling.eligible AND sibling.member_id<>r.member_id)
 HAVING count(*)>0
) p
CROSS JOIN LATERAL (
 SELECT jsonb_agg(jsonb_build_object('concert_id',member_id,'url',data->'url',
       'source_url',data->'source_url','source',data->'source') ORDER BY member_id) AS value,
       jsonb_agg(jsonb_build_object('concert_id',member_id,'date',data->'date','time_from',data->'time_from',
          'time_to',data->'time_to','city_id',data->'city_id','venue_id',data->'venue_id') ORDER BY member_id) AS occurrence_evidence,
       count(DISTINCT data->>'date')>1 AS date_conflict,
       count(DISTINCT data->>'time_from')>1 OR count(DISTINCT data->>'time_to')>1 AS time_conflict,
       count(DISTINCT data->>'venue_id')>1 OR count(DISTINCT data->>'city_id')>1 AS location_conflict
 FROM resolved_concert_member WHERE eligible AND concert_id=r.member_id
) s
CROSS JOIN LATERAL (
 SELECT jsonb_object_agg(key,evidence) AS value FROM (
   SELECT a.key,jsonb_agg(jsonb_build_object('concert_id',m.member_id,'assertion',a.value) ORDER BY m.member_id) AS evidence
   FROM resolved_concert_member m CROSS JOIN LATERAL jsonb_each(m.states) a
   WHERE m.concert_id=r.member_id AND m.eligible AND NOT COALESCE((a.value->>'requires_revalidation')::boolean,false)
   GROUP BY a.key
   HAVING bool_or(a.value->>'status'='not_applicable' OR a.value->'accepted_result'->>'status'='not_applicable')
     AND bool_or(a.value->'accepted_result'->>'status' IN ('complete','partial','composer_only'))
 ) conflicting_assertions
) assertions
WHERE r.member_id=r.concert_id AND r.eligible
WITH NO DATA;
CREATE UNIQUE INDEX resolved_concert_pk ON resolved_concert(id);
CREATE INDEX resolved_concert_date ON resolved_concert(date,time_from,id);
CREATE INDEX resolved_concert_city_date ON resolved_concert(city_id,date,id);
CREATE INDEX resolved_concert_country_date ON resolved_concert(country_code_resolved,date,id);

CREATE MATERIALIZED VIEW resolved_concert_performer AS
WITH candidates AS (
 SELECT m.concert_id,m.member_id,p.*,
    row_number() OVER (PARTITION BY m.concert_id,p.performer_id ORDER BY
       m.member_id=m.concert_id DESC,resolved_v1_tier(m.states,'performers'),
       (m.states->'performers'->>'accepted_at')::timestamptz DESC NULLS LAST,m.member_id) AS priority,
    to_jsonb(entity) AS performer,
    COALESCE((SELECT jsonb_agg(credit->'performer') FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(m.states->'performers'->'accepted_result'->'credits')='array'
       THEN m.states->'performers'->'accepted_result'->'credits' ELSE '[]'::jsonb END) credit
       WHERE credit->'performer'->>'existing_id'=p.performer_id::text),'[]') AS identity_evidence
 FROM resolved_concert_member m JOIN classical_concert_performer p ON p.classical_concert_id=m.member_id
 JOIN performer entity ON entity.id=p.performer_id
 WHERE m.eligible AND resolved_v1_allowed(m.states,'performers')
), combined AS (
 SELECT concert_id,performer_id,
    (array_agg(performer ORDER BY priority))[1] AS performer,
    (array_agg(voice_type ORDER BY priority) FILTER (WHERE voice_type IS NOT NULL))[1] AS voice_type,
    (array_agg(character_name ORDER BY priority) FILTER (WHERE character_name IS NOT NULL))[1] AS character_name,
    (array_agg(ensemble_id ORDER BY priority) FILTER (WHERE ensemble_id IS NOT NULL))[1] AS ensemble_id,
    (array_agg(qualifier ORDER BY priority) FILTER (WHERE qualifier IS NOT NULL))[1] AS qualifier,
    (array_agg(display_order ORDER BY priority))[1] AS display_order,
    array_agg(member_id ORDER BY member_id) AS contributor_ids,
    jsonb_agg(jsonb_build_object('concert_id',member_id,'source_url',source_url,'evidence',evidence,
        'checked_at',checked_at,'identity_evidence',identity_evidence,'credit',
        jsonb_build_object('voice_type',voice_type,'character_name',character_name,'ensemble_id',ensemble_id,
          'qualifier',qualifier,'roles',roles,'instruments',instruments)) ORDER BY member_id) AS provenance,
    count(DISTINCT voice_type)>1 OR count(DISTINCT character_name)>1 OR count(DISTINCT ensemble_id)>1
      OR count(DISTINCT qualifier)>1 AS credit_conflict
 FROM candidates GROUP BY concert_id,performer_id
), roles AS (
 SELECT concert_id,performer_id,array_agg(DISTINCT role ORDER BY role) AS value
 FROM candidates CROSS JOIN LATERAL unnest(roles) role GROUP BY concert_id,performer_id
), instruments AS (
 SELECT concert_id,performer_id,array_agg(DISTINCT instrument ORDER BY instrument) AS value
 FROM candidates CROSS JOIN LATERAL unnest(instruments) instrument GROUP BY concert_id,performer_id
), distinctions AS (
 SELECT concert_id,performer_id,
    jsonb_agg(DISTINCT declaration ORDER BY declaration) FILTER (WHERE declaration IS NOT NULL) AS declarations
 FROM candidates CROSS JOIN LATERAL jsonb_array_elements(identity_evidence) declaration
 GROUP BY concert_id,performer_id
)
SELECT c.*,COALESCE(r.value,ARRAY[]::text[]) AS roles,COALESCE(i.value,ARRAY[]::text[]) AS instruments,
 COALESCE(d.declarations,'[]') AS identity_evidence,
 ARRAY(SELECT DISTINCT (id #>> '{}')::bigint FROM jsonb_array_elements(COALESCE(d.declarations,'[]')) declaration
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(declaration->'distinct_from_ids')='array'
       THEN declaration->'distinct_from_ids' ELSE '[]'::jsonb END) id
    WHERE (id #>> '{}') ~ '^[0-9]+$' ORDER BY 1) AS distinct_from_ids,
 ARRAY(SELECT DISTINCT declaration->>'distinct_identity_reason' FROM jsonb_array_elements(COALESCE(d.declarations,'[]')) declaration
    WHERE NULLIF(declaration->>'distinct_identity_reason','') IS NOT NULL ORDER BY 1) AS distinct_identity_reasons,
 CASE WHEN c.credit_conflict THEN jsonb_build_object('credit_details',c.provenance) ELSE '{}'::jsonb END
 || CASE WHEN EXISTS (
    SELECT 1 FROM resolved_concert_member m WHERE m.concert_id=c.concert_id AND m.eligible
      AND (m.states->'performers'->'accepted_result'->>'status' IN ('complete','not_applicable')
           OR m.states->'performers'->>'status'='not_applicable')
      AND NOT COALESCE((m.states->'performers'->>'requires_revalidation')::boolean,false)
      AND (NOT resolved_v1_allowed(m.states,'performers') OR NOT EXISTS (
           SELECT 1 FROM classical_concert_performer p WHERE p.classical_concert_id=m.member_id AND p.performer_id=c.performer_id))
 ) THEN '{"source_disagreement":true}'::jsonb ELSE '{}'::jsonb END AS conflicts
FROM combined c LEFT JOIN roles r USING(concert_id,performer_id)
LEFT JOIN instruments i USING(concert_id,performer_id) LEFT JOIN distinctions d USING(concert_id,performer_id)
WITH NO DATA;
CREATE UNIQUE INDEX resolved_performer_pk ON resolved_concert_performer(concert_id,performer_id);
CREATE INDEX resolved_performer_reverse ON resolved_concert_performer(performer_id,concert_id);

CREATE MATERIALIZED VIEW resolved_concert_work AS
WITH candidates AS (
 SELECT m.concert_id,m.member_id,w.work_id,w.programme_label,w.source_url,w.evidence,
    to_jsonb(entity) AS work,entity.composer_id,
    row_number() OVER (PARTITION BY m.concert_id,w.work_id ORDER BY m.member_id=m.concert_id DESC,
      resolved_v1_tier(m.states,'programme'),(m.states->'programme'->>'accepted_at')::timestamptz DESC NULLS LAST,m.member_id) AS priority
 FROM resolved_concert_member m JOIN classical_concert_work w ON w.classical_concert_id=m.member_id
 JOIN work entity ON entity.id=w.work_id
 WHERE m.eligible AND resolved_v1_allowed(m.states,'programme')
), combined AS (
 SELECT concert_id,work_id,composer_id,(array_agg(work ORDER BY priority))[1] AS work,
   (array_agg(programme_label ORDER BY priority))[1] AS programme_label,
   array_agg(DISTINCT programme_label ORDER BY programme_label) AS programme_labels,
   array_agg(member_id ORDER BY member_id) AS contributor_ids,
   jsonb_agg(jsonb_build_object('concert_id',member_id,'source_url',source_url,'evidence',evidence,
      'programme_label',programme_label) ORDER BY member_id) AS provenance
 FROM candidates GROUP BY concert_id,work_id,composer_id
)
SELECT c.*,CASE WHEN cardinality(programme_labels)>1 THEN jsonb_build_object('programme_labels',provenance) ELSE '{}'::jsonb END
 || CASE WHEN EXISTS (
   SELECT 1 FROM resolved_concert_member m WHERE m.concert_id=c.concert_id AND m.eligible
     AND (m.states->'programme'->'accepted_result'->>'status' IN ('complete','not_applicable')
          OR m.states->'programme'->>'status'='not_applicable')
     AND NOT COALESCE((m.states->'programme'->>'requires_revalidation')::boolean,false)
     AND (NOT resolved_v1_allowed(m.states,'programme') OR NOT EXISTS (
       SELECT 1 FROM classical_concert_work w WHERE w.classical_concert_id=m.member_id AND w.work_id=c.work_id))
 ) THEN '{"source_disagreement":true}'::jsonb ELSE '{}'::jsonb END AS conflicts
FROM combined c WITH NO DATA;
CREATE UNIQUE INDEX resolved_work_pk ON resolved_concert_work(concert_id,work_id);
CREATE INDEX resolved_work_reverse ON resolved_concert_work(work_id,concert_id);

CREATE MATERIALIZED VIEW resolved_concert_composer AS
WITH contributions AS (
 SELECT m.concert_id,c.composer_id,jsonb_build_object('concert_id',m.member_id,'source_url',m.data->'source_url',
     'url',m.data->'url','kind','explicit') AS evidence
 FROM resolved_concert_member m JOIN classical_concert_composer c ON c.classical_concert_id=m.member_id
 WHERE m.eligible AND resolved_v1_allowed(m.states,'programme')
 UNION ALL
 SELECT concert_id,composer_id,jsonb_build_object('work_id',work_id,'kind','work','evidence',provenance)
 FROM resolved_concert_work
)
SELECT c.concert_id,c.composer_id,to_jsonb(entity) AS composer,
       jsonb_agg(DISTINCT c.evidence ORDER BY c.evidence) AS provenance
FROM contributions c JOIN composer entity ON entity.id=c.composer_id
GROUP BY c.concert_id,c.composer_id,entity.id WITH NO DATA;
CREATE UNIQUE INDEX resolved_composer_pk ON resolved_concert_composer(concert_id,composer_id);
CREATE INDEX resolved_composer_reverse ON resolved_concert_composer(composer_id,concert_id);

CREATE MATERIALIZED VIEW resolved_concert_ticket_price AS
WITH candidates AS (
 SELECT m.concert_id,p.id,m.member_id,
     to_jsonb(p)-'id'-'classical_concert_id'-'offer_key'-'evidence'-'checked_at' AS offer,
     jsonb_build_object('concert_id',m.member_id,'source_url',p.source_url,'evidence',p.evidence,'checked_at',p.checked_at) AS evidence
 FROM resolved_concert_member m JOIN classical_concert_ticket_price p ON p.classical_concert_id=m.member_id
 WHERE m.eligible AND resolved_v1_allowed(m.states,'pricing')
)
SELECT concert_id,min(id) AS offer_id,offer,
       array_agg(DISTINCT member_id ORDER BY member_id) AS contributor_ids,
       jsonb_agg(evidence ORDER BY member_id,id) AS provenance
FROM candidates GROUP BY concert_id,offer WITH NO DATA;
CREATE UNIQUE INDEX resolved_price_pk ON resolved_concert_ticket_price(concert_id,offer_id);
