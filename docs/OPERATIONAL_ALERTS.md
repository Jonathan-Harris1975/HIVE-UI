# Operational alerts in HIVE-UI

**Status:** Ready for production events  
**Last reviewed:** 22 June 2026

The Ops page reads the authenticated HIVE endpoint `GET /v1/system/ops-events`. It presents recent GitHub CI failures, Koyeb deployment failures, Cloudflare Pages failures and repeated runtime failures as compact, inspectable cards. HIVE-UI never receives the event-ingest token.

## Data flow

1. A provider watcher or runtime service sends a redacted event to HIVE.
2. HIVE validates the dedicated ingest token, redacts sensitive keys and stores the bounded event.
3. HIVE-UI obtains events through its existing server-side HIVE admin proxy.
4. Selecting a card opens the existing inspector with the event metadata and provider link.

A failed event fetch does not break the Ops dashboard. Repository health and workflows continue to load, while the alert panel remains absent until HIVE is reachable.

## Production acceptance

- Trigger a manual test event with a harmless summary.
- Confirm it appears only for an authenticated HIVE-UI session.
- Confirm no bearer token, provider credential or raw log is present.
- Confirm MAST is labelled `Background Worker` and uses the R2 heartbeat health contract.
- Confirm critical, warning and informational events are visually distinct and keyboard accessible.

## Required backend settings

HIVE must enable `OPS_EVENT_INGEST_ENABLED` and use a dedicated `OPS_EVENT_INGEST_TOKEN`. GitHub repositories use the matching token only through encrypted Actions secrets.
