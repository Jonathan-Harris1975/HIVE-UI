# HIVE-UI API Contract

HIVE-UI calls the backend through `/api/*`. In production, the Cloudflare Pages Function maps that prefix to the configured Koyeb HIVE service and adds the backend bearer token.

## Authentication boundary

```text
Browser
  X-HIVE-UI-Key
      ↓
Cloudflare Pages Function
  validates HIVE_UI_ACCESS_KEY
  injects Authorization: Bearer HIVE_ADMIN_TOKEN
      ↓
HIVE backend on Koyeb
```

The backend bearer token must never be compiled into the React bundle.

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
  "db_history_limit": 30
}
```

### SSE sequence

HIVE-UI accepts named or unnamed SSE frames. The Session 0 backend emits an early conversation frame before model tokens:

```text
event: meta
data: {"type":"conversation","conversation_id":"..."}
```

Token frames append assistant content. The final frame includes at least:

```json
{
  "conversation_id": "...",
  "db_recorded": true,
  "db_error": null,
  "model_used": "provider/model",
  "usage": {}
}
```

The interface refreshes the conversation list after completion.

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
GET  /v1/files/list?prefix=uploads%2F&limit=200
POST /v1/files/upload
GET  /v1/workflow-presets
POST /v1/chat/with-file
```

The `/files` route never creates a second chat implementation. It links to `/chat?file=<object_key>&name=<filename>` and the shared composer submits to `/v1/chat/with-file`.

## Models

```text
GET /v1/models
```

The picker always displays `Auto route` first. Selecting it sends no explicit model override.

## Skills

```text
GET  /v1/skills/list
GET  /v1/skills/search
POST /v1/skills/recommend
```

## Operations

```text
GET /health
GET /v1/system/repo-hygiene
GET /v1/workflow-graphs/templates
GET /v1/execution-reviews
```

The first UI release treats Ops data as read-only. Review decisions and execution-preview creation are reserved for a later gated slice.
