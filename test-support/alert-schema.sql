-- Test-only frozen schema generated from classical_bot/
-- db/migrations/versions/20260919000600_concert_email_alerts.py
-- revision 20260919000600. Regenerate from tables(MetaData()) using
-- SQLAlchemy CreateTable/CreateIndex with the PostgreSQL dialect when the contract changes.
-- This fixture does not run migrations or require the crawler repository at test time.

CREATE TABLE concert_alert_rate (
	key TEXT NOT NULL,
	count INTEGER NOT NULL,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (key)
);

CREATE TABLE concert_alert_subscriber (
	id BIGSERIAL NOT NULL,
	email TEXT NOT NULL,
	management_hash TEXT,
	generation INTEGER DEFAULT '0' NOT NULL,
	last_digest_day DATE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (email),
	UNIQUE (management_hash)
);

CREATE TABLE concert_alert (
	id BIGSERIAL NOT NULL,
	email TEXT NOT NULL,
	subscriber_id BIGINT NOT NULL,
	removed_at TIMESTAMP WITH TIME ZONE,
	status TEXT DEFAULT 'pending' NOT NULL,
	criteria JSONB,
	summary TEXT,
	pending_criteria JSONB,
	pending_summary TEXT,
	confirmation_hash TEXT,
	confirmation_expires_at TIMESTAMP WITH TIME ZONE,
	management_hash TEXT,
	generation INTEGER DEFAULT '0' NOT NULL,
	activated_at TIMESTAMP WITH TIME ZONE,
	last_digest_day DATE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_concert_alert_status CHECK (status IN ('pending','active','unsubscribed','expired','suspended')),
	FOREIGN KEY(subscriber_id) REFERENCES concert_alert_subscriber (id) ON DELETE CASCADE,
	UNIQUE (confirmation_hash),
	UNIQUE (management_hash)
);

CREATE INDEX ix_concert_alert_active ON concert_alert (status);

CREATE INDEX ix_concert_alert_subscriber ON concert_alert (subscriber_id);

CREATE TABLE concert_alert_delivered (
	subscriber_id BIGINT NOT NULL,
	concert_id INTEGER NOT NULL,
	PRIMARY KEY (subscriber_id, concert_id),
	FOREIGN KEY(subscriber_id) REFERENCES concert_alert_subscriber (id) ON DELETE CASCADE
);

CREATE TABLE concert_alert_digest (
	id BIGSERIAL NOT NULL,
	subscriber_id BIGINT NOT NULL,
	day DATE NOT NULL,
	matches JSONB NOT NULL,
	status TEXT DEFAULT 'pending' NOT NULL,
	attempts INTEGER DEFAULT '0' NOT NULL,
	attempted_at TIMESTAMP WITH TIME ZONE,
	accepted_at TIMESTAMP WITH TIME ZONE,
	failure_kind TEXT,
	PRIMARY KEY (id),
	CONSTRAINT uq_concert_alert_digest_day UNIQUE (subscriber_id, day),
	CONSTRAINT ck_concert_alert_digest_status CHECK (status IN ('pending','sending','accepted','held','cancelled','rejected')),
	FOREIGN KEY(subscriber_id) REFERENCES concert_alert_subscriber (id) ON DELETE CASCADE
);

CREATE INDEX ix_concert_alert_digest_status ON concert_alert_digest (status);

CREATE TABLE concert_alert_delivery (
	id BIGSERIAL NOT NULL,
	alert_id BIGINT NOT NULL,
	generation INTEGER NOT NULL,
	day DATE NOT NULL,
	concert_ids JSONB NOT NULL,
	status TEXT DEFAULT 'pending' NOT NULL,
	attempts INTEGER DEFAULT '0' NOT NULL,
	attempted_at TIMESTAMP WITH TIME ZONE,
	accepted_at TIMESTAMP WITH TIME ZONE,
	failure_kind TEXT,
	PRIMARY KEY (id),
	CONSTRAINT uq_concert_alert_delivery_day UNIQUE (alert_id, day),
	CONSTRAINT ck_concert_alert_delivery_status CHECK (status IN ('pending','sending','accepted','held','cancelled','rejected')),
	FOREIGN KEY(alert_id) REFERENCES concert_alert (id) ON DELETE CASCADE
);

CREATE INDEX ix_concert_alert_delivery_status ON concert_alert_delivery (status);

CREATE TABLE concert_alert_seen (
	alert_id BIGINT NOT NULL,
	concert_id INTEGER NOT NULL,
	PRIMARY KEY (alert_id, concert_id),
	FOREIGN KEY(alert_id) REFERENCES concert_alert (id) ON DELETE CASCADE
);
