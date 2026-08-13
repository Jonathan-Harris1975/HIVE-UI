> **Document status:** Production reference  
> **Last reviewed:** 5 July 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI

**Current UI marker:** `0.12.0` / `worker-gateway`.

HIVE-UI is the private React operator interface for HIVE. It is deployed on Cloudflare Worker and proxies authenticated API traffic to the HIVE backend without exposing the backend bearer token to the browser.

## Production capabilities

- Shared chat interface with persisted streamed conversations.
- File upload and authenticated browsing across configured R2 lanes.
- File chat, citations and a collapsed desktop inspector.
- Searchable model groups: Auto, configured, free, chat, reasoning, coding, documents, vision, image, video and audio.
- Image and video generation models are discovery-only until a dedicated creation workspace is released.
- Skills search, recommendation and risk/status filtering.
- Compact Ops dashboard with two-column repository and operational health cards.
- Signed `HttpOnly` session cookie, login throttling and hardened Cloudflare proxy routes.

## Routes

| Route | Purpose |
|---|---|
| `/chat` | Conversations and shared file chat |
| `/files` | Uploads and multi-bucket browsing |
| `/skills` | Skills discovery and recommendation |
| `/ops` | Health, workflows, execution and review status |
| `/health` | Public Cloudflare Worker health function |

## Local verification

```bash
npm ci --no-audit --no-fund
npm run check
```

## Cloudflare Worker deployment

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm ci --no-audit --no-fund && npm run check` |
| Output directory | `dist` |
| Production URL | `https://hive.jonathan-harris.online` |

Required Worker variables:

- `HIVE_API_BASE_URL`
- `HIVE_UI_SESSION_TTL_SECONDS`
- `HIVE_UI_IDLE_TIMEOUT_SECONDS`
- `KOYEB_SERVICE_ID_HIVE`
- `KOYEB_SERVICE_ID_AIMS`
- `HIVE_COMMS_ACTOR`
- `HIVE_COMMS_ROLE`
- `HIVE_COMMS_URL`

Required encrypted Worker secrets:

- `HIVE_ADMIN_TOKEN`
- `HIVE_UI_ACCESS_KEY`
- `KOYEB_TOKEN`
- `HIVE_COMMS_HANDOFF_SECRET`

`HIVE_COMMS_HANDOFF_SECRET` must exactly match the AIMS-UI Worker secret of the same name.

Interactive HIVE and AIMS uptime is session-driven: a successful login resumes both services when needed, genuine user activity refreshes the 30-minute idle window, and manual or idle logout pauses each service only when that UI session was the actor that woke it. A service already running for MAST governance is not claimed by the UI session and is left for MAST to return to standby.

The access key belongs in Cloudflare Worker Variables and Secrets, not only in GitHub Secrets. See [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md) and [`SECURITY.md`](SECURITY.md).

## Operational alerts

The Ops route now displays recent redacted provider and runtime events supplied by HIVE, including GitHub CI, Koyeb deployment and Cloudflare Worker failures. See [`docs/OPERATIONAL_ALERTS.md`](docs/OPERATIONAL_ALERTS.md).
