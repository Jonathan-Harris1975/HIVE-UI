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
  "db_history_limit": 40
}
```

### SSE sequence

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
GET  /v1/files/list?prefix=uploads%2F&limit=200
GET  /v1/files/r2-lanes
POST /v1/files/upload
POST /v1/files/upload-text
GET  /v1/workflow-presets
POST /v1/chat/with-file
```

The `/files` route links to `/chat?file=<object_key>&name=<filename>` and the shared composer submits to `/v1/chat/with-file`.

`GET /v1/files/r2-lanes` is registry metadata. It does not grant arbitrary multi-bucket access. The UI labels non-upload lanes as registry-only.

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
GET  /health
GET  /v1/system/repo-hygiene
GET  /v1/workflow-graphs/templates
POST /v1/workflow-graphs/build
POST /v1/execution-preview
GET  /v1/execution-reviews
GET  /v1/execution-reviews/{id}/evidence
POST /v1/execution-reviews/{id}/decision
```

The UI creates plans, previews and review decisions only. It does not enable live execution adapters or mutate repositories.
