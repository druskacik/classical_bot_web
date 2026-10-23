CREATE SCHEMA serving;
CREATE TABLE serving.generation (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 schema_version integer NOT NULL DEFAULT 1,
 input_mode text NOT NULL DEFAULT 'legacy' CHECK(input_mode IN ('legacy','direct')),
 input_published_at timestamptz NOT NULL,
 built_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 row_counts jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE serving.state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 input_mode text NOT NULL DEFAULT 'legacy' CHECK(input_mode IN ('legacy','direct')),
 active_generation bigint REFERENCES serving.generation,
 previous_generation bigint REFERENCES serving.generation,
 last_attempt_at timestamptz, last_failure_at timestamptz, last_error text,
 duration_seconds double precision
);
INSERT INTO serving.state(singleton) VALUES(true);
CREATE TABLE serving.concert (
 generation_id bigint NOT NULL REFERENCES serving.generation ON DELETE CASCADE,
 id integer NOT NULL, date date, time_from time, time_to time,
 title text, url text, type text, venue text, venue_id bigint, city_id bigint,
 city_raw text,country_code_raw text,country_code_resolved text,
 event_status text,admission_type text,
 source text,source_url text,
 PRIMARY KEY(generation_id,id)
);
CREATE INDEX serving_concert_date ON serving.concert(generation_id,date,time_from,id);
CREATE INDEX serving_concert_country ON serving.concert(generation_id,country_code_resolved,date,id);
CREATE INDEX serving_concert_city ON serving.concert(generation_id,city_id,date,id);
CREATE INDEX serving_concert_raw_city ON serving.concert(generation_id,lower(city_raw),COALESCE(country_code_resolved,country_code_raw),date,id) WHERE city_id IS NULL;
CREATE TABLE serving.concert_document (
 generation_id bigint NOT NULL,concert_id integer NOT NULL,
 scalar jsonb NOT NULL,performers jsonb NOT NULL,works jsonb NOT NULL,
 composers jsonb NOT NULL,prices jsonb NOT NULL,
 PRIMARY KEY(generation_id,concert_id),
 FOREIGN KEY(generation_id,concert_id) REFERENCES serving.concert ON DELETE CASCADE
);
-- Diagnostic evidence is separate from public documents and request-time queries.
CREATE TABLE serving.diagnostic (
 generation_id bigint NOT NULL,concert_id integer NOT NULL,payload jsonb NOT NULL,
 PRIMARY KEY(generation_id,concert_id),
 FOREIGN KEY(generation_id,concert_id) REFERENCES serving.concert ON DELETE CASCADE
);
CREATE TABLE serving.member (
 generation_id bigint NOT NULL, member_id integer NOT NULL,concert_id integer NOT NULL,eligible boolean NOT NULL,
 PRIMARY KEY(generation_id,member_id),
 FOREIGN KEY(generation_id,concert_id) REFERENCES serving.concert ON DELETE CASCADE
);
CREATE INDEX serving_member_group ON serving.member(generation_id,concert_id,member_id);
CREATE TABLE serving.occurrence (
 generation_id bigint NOT NULL,member_id integer NOT NULL,concert_id integer NOT NULL,
 date date,member_date date,source_url text,normalized_url text,source text,event_url text,
 PRIMARY KEY(generation_id,member_id),
 FOREIGN KEY(generation_id,concert_id) REFERENCES serving.concert ON DELETE CASCADE
);
CREATE INDEX serving_occurrence_url ON serving.occurrence(generation_id,normalized_url,date,concert_id);
CREATE INDEX serving_occurrence_group ON serving.occurrence(generation_id,concert_id);
CREATE TABLE serving.source_summary (
 generation_id bigint NOT NULL REFERENCES serving.generation ON DELETE CASCADE,
 normalized_url text NOT NULL,source text,member_date date,member_id integer,
 PRIMARY KEY(generation_id,normalized_url)
);
CREATE TABLE serving.composer (
 generation_id bigint NOT NULL REFERENCES serving.generation ON DELETE CASCADE,
 id integer NOT NULL,name text,normalized_name text,published boolean NOT NULL,
 PRIMARY KEY(generation_id,id)
);
CREATE TABLE serving.work (
 generation_id bigint NOT NULL REFERENCES serving.generation ON DELETE CASCADE,
 id integer NOT NULL,composer_id integer,title text,normalized_title text,catalogue_number text,
 PRIMARY KEY(generation_id,id)
);
CREATE TABLE serving.concert_composer (
 generation_id bigint NOT NULL,concert_id integer NOT NULL,composer_id integer NOT NULL,name text,
 PRIMARY KEY(generation_id,concert_id,composer_id),
 FOREIGN KEY(generation_id,concert_id) REFERENCES serving.concert ON DELETE CASCADE
);
CREATE INDEX serving_composer_reverse ON serving.concert_composer(generation_id,composer_id,concert_id);
CREATE INDEX serving_composer_name ON serving.concert_composer(generation_id,name,concert_id);
CREATE TABLE serving.concert_work (
 generation_id bigint NOT NULL,concert_id integer NOT NULL,work_id integer NOT NULL,composer_id integer,
 programme_label text,
 PRIMARY KEY(generation_id,concert_id,work_id),
 FOREIGN KEY(generation_id,concert_id) REFERENCES serving.concert ON DELETE CASCADE
);
CREATE INDEX serving_work_reverse ON serving.concert_work(generation_id,work_id,concert_id);
CREATE TABLE serving.concert_performer (
 generation_id bigint NOT NULL,concert_id integer NOT NULL,performer_id bigint NOT NULL,
 PRIMARY KEY(generation_id,concert_id,performer_id),
 FOREIGN KEY(generation_id,concert_id) REFERENCES serving.concert ON DELETE CASCADE
);
CREATE INDEX serving_performer_reverse ON serving.concert_performer(generation_id,performer_id,concert_id);
CREATE TABLE serving.facet_daily (
 generation_id bigint NOT NULL REFERENCES serving.generation ON DELETE CASCADE,
 kind text NOT NULL,value text NOT NULL,date date NOT NULL,
 scope text NOT NULL,country text NOT NULL,count bigint NOT NULL,
 PRIMARY KEY(generation_id,kind,scope,country,value,date)
);
CREATE INDEX serving_facet_dates ON serving.facet_daily(generation_id,kind,scope,country,date,value) INCLUDE(count);
CREATE TABLE serving.registry_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),revision bigint NOT NULL DEFAULT 0,
 published_at timestamptz,input_hash text
);
INSERT INTO serving.registry_state(singleton) VALUES(true);
CREATE TABLE serving.source_registry (
 revision bigint NOT NULL,id bigint NOT NULL,root_id bigint,canonical_url text NOT NULL,
 PRIMARY KEY(revision,id)
);
CREATE TABLE serving.source_url (
 revision bigint NOT NULL,normalized_url text NOT NULL,hostname text NOT NULL,source_id bigint NOT NULL,root_id bigint NOT NULL,
 PRIMARY KEY(revision,normalized_url,source_id)
);
CREATE INDEX serving_source_host ON serving.source_url(revision,hostname,root_id);
CREATE INDEX serving_source_root ON serving.source_url(revision,root_id,normalized_url);

-- Every consumer must explicitly pin a generation in its read transaction.
CREATE FUNCTION serving.pinned_generation() RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE value text := current_setting('serving.generation',true);
BEGIN
 IF value IS NULL OR value='' THEN RAISE EXCEPTION 'Serving generation is not pinned'; END IF;
 RETURN value::bigint;
END $$;
CREATE VIEW serving.current_concert AS SELECT * FROM serving.concert WHERE generation_id=serving.pinned_generation();
CREATE VIEW serving.current_document AS SELECT * FROM serving.concert_document WHERE generation_id=serving.pinned_generation();
CREATE VIEW serving.current_member AS SELECT * FROM serving.member WHERE generation_id=serving.pinned_generation();
CREATE VIEW serving.current_occurrence AS SELECT * FROM serving.occurrence WHERE generation_id=serving.pinned_generation();
CREATE VIEW serving.current_composer AS SELECT * FROM serving.composer WHERE generation_id=serving.pinned_generation();
CREATE VIEW serving.current_work AS SELECT * FROM serving.work WHERE generation_id=serving.pinned_generation();
CREATE VIEW serving.current_concert_composer AS SELECT * FROM serving.concert_composer WHERE generation_id=serving.pinned_generation();
CREATE VIEW serving.current_concert_work AS SELECT * FROM serving.concert_work WHERE generation_id=serving.pinned_generation();
CREATE VIEW serving.current_concert_performer AS SELECT * FROM serving.concert_performer WHERE generation_id=serving.pinned_generation();
CREATE VIEW serving.current_facet_daily AS SELECT * FROM serving.facet_daily WHERE generation_id=serving.pinned_generation();
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE INDEX serving_composer_search ON serving.composer USING gin(normalized_name public.gin_trgm_ops);
CREATE INDEX serving_work_search ON serving.work USING gin(normalized_title public.gin_trgm_ops);
CREATE TABLE serving.raw_city_daily (
 generation_id bigint NOT NULL REFERENCES serving.generation ON DELETE CASCADE,
 name text NOT NULL,label text NOT NULL,country text NOT NULL,resolved_country text NOT NULL,
 date date NOT NULL,count bigint NOT NULL,
 PRIMARY KEY(generation_id,name,country,resolved_country,date)
);
CREATE VIEW serving.current_raw_city_daily AS SELECT * FROM serving.raw_city_daily WHERE generation_id=serving.pinned_generation();

CREATE FUNCTION serving.policy_v1_allowed(states jsonb, field text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT NOT COALESCE((states->field->>'requires_revalidation')::boolean,false)
    AND COALESCE(states->field->>'status','') <> 'not_applicable'
    AND COALESCE(states->field->'accepted_result'->>'status','') <> 'not_applicable'
$$;
CREATE FUNCTION serving.policy_v1_tier(states jsonb, field text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE states->field->'accepted_result'->>'status'
    WHEN 'complete' THEN 0 WHEN 'composer_only' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END
$$;

