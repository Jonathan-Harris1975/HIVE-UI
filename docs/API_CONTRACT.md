> **Document status:** Production reference  
> **Last reviewed:** 16 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI API contract

HIVE-UI calls the backend through same-origin `/api/*` requests. In production, the Cloudflare Pages Function maps approved paths to the Koyeb HIVE service and adds the backend bearer token.

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

The session is HMAC-signed using the configured UI access secret. The raw access key is not stored in browser storage and is not forwarded to HIVE.

### Session restore

```text
GET /api/auth/session
```

### Logout

```text
POST /api/auth/logout
```

### Proxy authentication flow

```text
Browser
  signed __Host-hive_session cookie
      ↓
Cloudflare Pages Function
  verifies expiry and signature
  restricts the route
  sanitises headers
  injects Authorization: Bearer HIVE_ADMIN_TOKEN
      ↓
HIVE backend on Koyeb
```

The Function forwards only:

```text
/health
/livez
/readyz
/v1/*
```

Unknown, traversal-like and absolute URL paths are rejected at the edge.

When the UI session is invalid, the Function returns:

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

## Skills

```text
GET  /v1/skills/list
GET  /v1/skills/search
POST /v1/skills/recommend
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
