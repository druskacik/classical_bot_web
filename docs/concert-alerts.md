# Concert email alerts

English ClassicalBot supports any number of independent saved searches per email address. Subscribers receive one combined daily email only when there are new matches. Filters include country, city/radius, composer, work, and explicit dates; map bounds are excluded. New or edited searches establish their own baseline, so existing matches are not emailed. Date presets are saved as fixed dates, not rolling windows.

## User flow

Public signup emails a confirmation link for that search. Opening it confirms automatically and opens **Your alerts**, highlighting the confirmed search. Every confirmation and digest includes **Manage alerts**. That private link accesses the complete list without confirming pending searches. Adding or editing through this list takes effect immediately; identical active/pending searches return “You already have this alert.” Matching unsubscribed or removed searches are reactivated in place, restoring removed searches to the list and establishing a fresh baseline. Public signup also reuses these searches, but reactivation waits for email confirmation. Editing into an inactive match reactivates that match and removes the replaced search. The public form never reveals subscriptions or access tokens in its response.

Signup, adding an alert, and editing an alert use the same native dialog with editable country, city/radius, date, composer, and work filters. Discovery pre-fills a separate draft from the current search; management opens the dialog in place. Cancel discards the draft without changing the listing or URL. Managed saves refresh the list and focus the saved alert; public signup displays the inbox confirmation in the dialog. At least one filter is required when creating or saving an alert. Empty drafts remain previewable; validation appears only after a save attempt. Existing saved alerts and delivery remain unchanged. Map bounds remain unsupported.

Management supports independent edits, removal, pagination (50 entries per page), and an explicit **Unsubscribe from all** action. Removal retains internal history. Unsubscribe-all invalidates pending confirmation links too. Subscribers can save a new search later from their private link. Browser access is stored in tab-scoped session storage; fragments are stripped from the address bar. Clearing browser state requires reopening an email link. No passwords or user accounts are introduced.

## Schema and deployment

The feature uses one migration in the normal `classical_bot` repository: `20260919000600_concert_email_alerts`, following `20260919000500`. It creates the complete multi-alert schema directly. The earlier local-only versions were consolidated before production deployment; the separate `20260920000100` migration no longer exists. Review the current database revision and any intervening migrations before applying the chain.

The migration creates all seven alert tables, including subscriber ownership, per-search baselines, combined digests, and delivered-concert history. Downgrade drops these feature tables and all their data. It is appropriate for a disposable local reset; production rollback should disable the feature and retain subscriber data.

1. Disable `NUXT_PUBLIC_ALERTS_ENABLED` and stop the old worker before applying the migration and deploying the updated web app. Do not run old application code against the new schema.
2. Grant the web role SELECT/INSERT/UPDATE/DELETE on all seven `concert_alert*` tables, and USAGE/SELECT on ID sequences for alerts, subscribers, digests, and legacy deliveries. Concert, city, composer, and work tables only need SELECT.
3. Configure a stable random `ALERTS_TOKEN_SECRET` of at least 32 characters. Keep it private and stable. Subscriber links are HMAC-derived independently of individual alert edits. Secret rotation is an operator recovery operation, not a routine deployment step; mismatched signing keys block new emails rather than generating unusable links.
4. Reuse contact-form `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`. Subscribers, not `SMTP_TO`, are the recipients. Validate sender authentication/provider allowance before enabling delivery.
5. Enable alerts with `NUXT_PUBLIC_ALERTS_ENABLED=true`. This single flag enables the signup/Add/Edit UI, preview/create/update/confirm endpoints, and scheduled digest delivery; it defaults to false. Management, removal, and unsubscribe remain available when disabled. Keep it false in development unless SMTP is mocked or configured for a test mailbox. The former `NUXT_PUBLIC_ALERTS_SIGNUP_ENABLED` and `ALERTS_SENDING_ENABLED` switches are no longer read; replace them with the new setting when deploying. `ALERTS_HOURLY_LIMIT` defaults to 200 digest SMTP attempts in any rolling hour across all subscribers and server instances, including retries. There is no daily global cap; the old `ALERTS_DAILY_LIMIT` setting is no longer used. Confirmation and contact emails do not consume the digest budget. Public confirmation limits remain three/email/hour, five/IP/15 minutes, and 30 globally/hour; they do not cap saved alert counts.
6. Verify confirmation, combined digest, management, and unsubscribe with a designated test mailbox before public rollout. This implementation has not applied a production migration or sent production mail.

Local confirmation emails use the validated localhost request origin; production uses the canonical site origin. Contact form behavior and the Slovak site are unchanged.

## Scheduling and delivery

The in-process Nitro task runs every 15 minutes and sends after 08:00 Europe/Prague. PostgreSQL advisory lock `78239001` excludes overlapping workers. Matching queries uncached concert data and combines each subscriber's active searches. A digest contains at most 50 distinct concerts sorted by date; overflow waits for subsequent days. Per-search baselines suppress initial matches. Subscriber delivery history and recursive canonical-duplicate resolution prevent a concert being emailed again through another alert. Late programme/location enrichment can produce an eligible new match.

Delivery snapshots retain contributing alert IDs and versions. The worker revalidates status, version, and current matches before SMTP. Subscriber row locks serialize sends against create/edit/remove/unsubscribe. Acceptance records delivered IDs, per-search seen IDs, and the subscriber's delivery day together.

Definite temporary failures retry after at least an hour, at most three attempts. Retried unsent digests are rebuilt from current searches. Permanent recipient rejection suspends active searches. Interrupted or ambiguous SMTP outcomes become `held` and block all delivery for that subscriber, even if searches are edited. SMTP cannot guarantee exactly-once inbox delivery.

Confirmation tokens expire after 24 hours. Management and confirmation hashes are stored in the database; raw tokens travel in URL fragments and POST bodies. GET alone does not mutate subscriptions, but a scanner executing JavaScript can trigger automatic confirmation. Treat management links like passwords. Pending searches older than seven days and expired rate-limit buckets are cleaned up by the enabled worker. Deleting a subscriber row cascades through its alerts and delivery history.

## Operations

Monitor aggregate worker counts and held deliveries:

```sql
SELECT status, count(*) FROM concert_alert WHERE removed_at IS NULL GROUP BY status;
SELECT status, count(*) FROM concert_alert_digest GROUP BY status;
SELECT max(accepted_at) AS last_accepted FROM concert_alert_digest;
SELECT id, subscriber_id, day, attempts, failure_kind
FROM concert_alert_digest WHERE status = 'held' ORDER BY id;
```

Investigate held deliveries using provider evidence. Confirmed acceptance requires recording the snapshot's concert IDs as delivered and the delivery day atomically. Only evidence of non-acceptance allows a reset to pending. Do not automatically replay held deliveries or clear them when a user edits a search. Preserve legacy delivery history for investigation.

Rollback is feature-disable plus a forward fix, not schema downgrade or old-code deployment. Keep management and unsubscribe available on the new application while signup/sending are off.

## Validation

`npm test` is database-free by default. Integration tests never load `.env` and require a localhost database named `concert_alert_test`; they delete/recreate its public schema. Generate `/tmp/alert-schema.sql` from current `db.alert_models.register_alert_tables` metadata, then run:

```sh
ALERT_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/concert_alert_test \
ALERT_TEST_SCHEMA_SQL=/tmp/alert-schema.sql \
node --test test/alerts.test.js test/alerts-integration.test.js
```

Coverage includes independent confirmation, duplicate/concurrent saves, ownership, stable and legacy links, combined delivery, overlap, baselines, late enrichment, subscriber history, pagination, overflow, canonical records, retry/held outcomes, expiry, and unsubscribe-all. The crawler schema test checks frozen migration/model consistency. The combined migration is validated through upgrade, downgrade, and re-upgrade on a separate disposable PostgreSQL database. UI verification uses Playwright MCP against synthetic local data.
