# HIVE-UI

HIVE-UI is the private React operator interface for HIVE. It runs behind a Cloudflare Worker that keeps the HIVE admin bearer token out of browser JavaScript.

## Capabilities

- Persisted streamed HIVE conversations.
- File upload, R2-lane browsing and file chat with citations.
- Searchable model groups for configured text/reasoning/coding/document/vision and discovery categories.
- Skills discovery, recommendation and risk/status filtering.
- Repository intelligence and Repository Memory views.
- Ops dashboard for HIVE, AIMS, RAMS and website operational evidence.
- Embedded AIMS Comms Hub through a signed cross-subdomain hand-off.
- Signed `HttpOnly` UI session, login throttling and hardened proxy routes.

## Main routes

| Route | Purpose |
|---|---|
| `/chat` | conversations and file chat |
| `/files` | uploads and configured storage lanes |
| `/skills` | skill discovery/recommendation |
| `/repositories` and related views | repository intelligence/memory |
| `/communications` | embedded AIMS Comms Hub |
| `/ops` | ecosystem health and operations |
| `/health` | public Worker health |

## AIMS Communications hand-off

The Communications page requests `/api/auth/comms-handoff`, validates the returned destination is `https://chat.jonathan-harris.online/console/`, and embeds the operator console only after the signed hand-off succeeds. A dedicated `HIVE_COMMS_HANDOFF_SECRET` is required and is validated through `/api/auth/comms-identity`. HIVE-UI does not derive hand-off signing material from the access credential.

## Local verification

```bash
npm ci --no-audit --no-fund
npm run check
```

## Cloudflare deployment

Production deploys the validated `dist` assets through the Worker on `https://hive.jonathan-harris.online`. Required Worker variables and secrets are documented in `.env.example`, `wrangler.toml`, `docs/DEPLOYMENT_CHECKLIST.md` and `SECURITY.md`.

Required secrets include `HIVE_ADMIN_TOKEN`, `HIVE_UI_ACCESS_KEY` and `KOYEB_TOKEN`. Dedicated `HIVE_UI_SESSION_SECRET` and `HIVE_COMMS_HANDOFF_SECRET` values are required so access, session and communications credentials can be rotated independently. Secrets belong in Cloudflare secrets, never in browser-visible configuration.

Interactive HIVE/AIMS lifecycle control is session-driven: a login can resume required services, user activity refreshes the idle window, and logout/idle handling pauses only services claimed by that UI session. Services already active for MAST governance remain under MAST ownership.

## Operational alerts

The Ops view displays redacted provider/runtime events supplied by HIVE, including supported GitHub, Koyeb and Cloudflare failures. See `docs/OPERATIONAL_ALERTS.md` and `docs/OPERATIONS.md`.


Security configuration: a distinct encrypted `HIVE_UI_SESSION_SECRET` is mandatory. Missing session or communications signing secrets fail closed with HTTP 503; `HIVE_UI_ACCESS_KEY` is used only for login verification. Login throttling uses the `LOGIN_RATE_LIMITER` Durable Object binding declared in `wrangler.toml`.
