> **Document status:** Production reference  
> **Last reviewed:** 22 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI

**Current UI marker:** `0.10.8` / `review-state-sync`.

HIVE-UI is the private React operator interface for HIVE. It is deployed on Cloudflare Pages and proxies authenticated API traffic to the HIVE backend without exposing the backend bearer token to the browser.

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
| `/health` | Public Cloudflare Pages health function |

## Local verification

```bash
npm ci --no-audit --no-fund
npm run check
```

## Cloudflare Pages deployment

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm ci --no-audit --no-fund && npm run check` |
| Output directory | `dist` |
| Production URL | `https://hive.jonathan-harris.online` |

Required encrypted variables:

- `HIVE_API_BASE_URL`
- `HIVE_ADMIN_TOKEN`
- `HIVE_UI_ACCESS_KEY`

Optional: `HIVE_UI_SESSION_TTL_SECONDS`.

The access key belongs in Cloudflare Pages Variables and Secrets, not only in GitHub Secrets. See [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md) and [`SECURITY.md`](SECURITY.md).

## Operational alerts

The Ops route now displays recent redacted provider and runtime events supplied by HIVE, including GitHub CI, Koyeb deployment and Cloudflare Pages failures. See [`docs/OPERATIONAL_ALERTS.md`](docs/OPERATIONAL_ALERTS.md).
