> **Document status:** Production reference  
> **Last reviewed:** 20 September 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI API contract

HIVE-UI calls the backend through same-origin `/api/*` requests. In production, the Cloudflare Worker gateway maps approved paths to the Koyeb HIVE service and adds the backend bearer token.

## Authentication boundary

### Login

```text
POST /api/auth/login
Content-Type: application/json

{ "access_key": "..." }
```

A successful login returns `200` and creates:

```text
__Host-hive_session
Path=/
HttpOnly
Secure
SameSite=Strict
```

The access key is used only for login verification. The session is HMAC-signed with the independent mandatory `HIVE_UI_SESSION_SECRET`; it does not fall back to or derive signing material from `HIVE_UI_ACCESS_KEY`. The raw access key is not stored in browser storage and is not forwarded to HIVE. Login also resumes the Koyeb HIVE service when it is in standby. The signed session records whether this UI session owns that wake-up so MAST-owned governance uptime is not accidentally paused on logout.

#### Failed-login limiter contract

Every login is protected by the required `LOGIN_RATE_LIMITER` Durable Object binding, implemented by the `LoginRateLimiter` class. The Worker derives a per-client key, checks the Durable Object before credential evaluation, and stores `{ failures, resetAt }` in Durable Object storage.

- The first failed attempt starts a fixed 10-minute window.
- Failures within that window increment the stored count.
- The fifth failed attempt reaches the block threshold and returns HTTP 429 with `Retry-After`; attempts remain blocked until the original window expires.
- A successful credential check must clear the stored failure state before a session is issued.
- If the binding is missing or the limiter request/clear operation fails, login returns HTTP 503 with `login_rate_limiter_unavailable`. Authentication does not fail open.

The production `wrangler.toml` must retain `LOGIN_RATE_LIMITER` -> `LoginRateLimiter` and the SQLite Durable Object migration for `LoginRateLimiter`.

### Session restore

```text
GET /api/auth/session
```

### Activity heartbeat

```text
POST /api/auth/activity
```

Only genuine browser interaction calls this route. Background API polling does not refresh the idle window. The production default is 1800 seconds (30 minutes).

### Logout

```text
POST /api/auth/logout
```

Logout clears the signed cookie and pauses HIVE and/or AIMS when the current UI session owns the corresponding interactive wake-up. An idle-expired signed session is still accepted for this release step, but not for normal API access.

### Proxy authentication flow

```text
Browser
  signed __Host-hive_session cookie
      ↓
Cloudflare Worker gateway
  verifies expiry and signature
  restricts the route
  sanitises headers
  injects Authorization: Bearer HIVE_ADMIN_TOKEN
      ↓
HIVE backend on Koyeb
```

The Worker gateway forwards only:

```text
/health
/livez
/readyz
/v1/*
```

Unknown, traversal-like and absolute URL paths are rejected at the edge.

When the UI session is invalid, the Worker returns:

```text
HTTP 401
X-HIVE-Auth-State: session-invalid
```

A Koyeb/HIVE `401` is passed through without that session-invalid marker, allowing the UI to distinguish an expired UI session from a backend-token problem.

## Request tracing

Every proxy response includes `X-Request-ID`. A safe client-supplied request ID is preserved; otherwise the Function creates one and forwards it to HIVE.

## Streaming chat

### Request

`POST /v1/chat/stream`

```json
{
  "message": "Inspect the latest audit findings",
  "mode": "auto",
  "model": null,
  "conversation_id": null,
  "use_persisted_history": true,
  "db_history_limit": 40
}
```

The backend emits an early conversation frame before model tokens:

```text
event: meta
data: {"type":"conversation","conversation_id":"..."}
```

Token frames append assistant content. The final frame contains conversation identity, persistence status, model/provider metadata and usage where available.

## Conversation operations

```text
GET    /v1/db/conversations?limit=100
GET    /v1/db/conversations/{conversation_id}?limit=200
PATCH  /v1/db/conversations/{conversation_id}
DELETE /v1/db/conversations/{conversation_id}
```

Rename body:

```json
{ "title": "June audit investigation" }
```

## Files and shared chat

```text
GET  /v1/files/r2-lanes
GET  /v1/files/r2/{lane}/objects?prefix=&limit=100&cursor=&search=
GET  /v1/files/r2/{lane}/metadata?key=
GET  /v1/files/r2/{lane}/read?key=&max_chars=40000
GET  /v1/files/r2/{lane}/download?key=
POST /v1/files/upload
POST /v1/files/upload-text
GET  /v1/workflow-presets
POST /v1/chat/with-file
```

The `/files` route links to `/chat?lane=<lane>&file=<object_key>&name=<filename>`. The chat request includes the lane. Persisted chunk/Vectorize retrieval is enabled only for the uploads lane; non-upload lanes use a bounded direct read unless a lane-specific chunk index is added later.

## Models

```text
GET /v1/models
```

The response includes model groups, modalities, configured roles, free-model status, `chat_selectable` and a disabled reason. The picker always displays `Auto route` first. Image/video generation models are visible but disabled for ordinary chat in this release.


```text
```

## Operations

```text
GET  /health
GET  /v1/system/repo-hygiene
GET  /v1/workflow-graphs/templates
POST /v1/workflow-graphs/build
POST /v1/execution-preview
GET  /v1/execution-reviews
GET  /v1/execution-reviews/{id}/evidence
POST /v1/execution-reviews/{id}/decision
```

The UI creates plans, previews and review decisions. When the backend reports `execution_adapters_enabled:true`, an approved review can move to an allow-listed production handoff; approval still does not auto-run repository mutations or background jobs.
