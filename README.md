# HIVE-UI

Private Cloudflare Pages frontend for **HIVE (Harris Intelligent Virtual Entity)**.

HIVE remains the Python/FastAPI backend on Koyeb. This repository contains the React interface and a Cloudflare Pages Function that keeps the backend bearer token server-side.

## Current release

**Version:** `0.7.0`  
**Build:** `production-grade-cloudflare-session`

The production release includes:

- Four primary routes: `/chat`, `/files`, `/skills`, and `/ops`.
- Shared chat interface for ordinary chat and file chat.
- Persistent streamed conversations with rename and delete support.
- Auto route followed by explicit models from `GET /v1/models`.
- File upload, extraction workflows, citations and an R2 storage registry.
- Skill search, recommendations, filters and status badges.
- Health, workflow graph, execution preview, repo hygiene and review views.
- Branded favicon, install icons and responsive HIVE styling.
- Collapsible desktop inspector, closed by default.
- Cloudflare Pages Function proxy with a server-side HIVE bearer token.
- Signed, host-only, `HttpOnly`, `Secure`, `SameSite=Strict` UI sessions.
- Login throttling, constant-work access-key comparison and same-origin checks.
- Restricted proxy routes, sanitised request/response headers and request IDs.
- CSP, HSTS, anti-framing, no-index and cross-origin isolation headers.
- Locked dependencies, registry verification, security tests and bundle budgets.
- GitHub Actions checks, dependency audit and production artifact upload.

HIVE-UI does not directly execute skills, mutate repositories or start uncontrolled background jobs. Ops actions create plans, previews and review records only.

## Repository layout

```text
HIVE-UI/
├── .github/                    CI and Dependabot configuration
├── functions/_lib/            Pages Function session security helpers
├── functions/api/             authenticated Cloudflare proxy
├── public/                     icons, headers and SPA routing rules
├── scripts/                    source, lockfile, security and dist checks
├── src/components/             shell, chat, status, graph and recovery UI
├── src/context/                auth, chat and inspector state
├── src/hooks/                  browser runtime hooks
├── src/lib/                    typed API/SSE and build helpers
├── src/pages/                  chat, files, skills and ops routes
├── src/types/                  frontend API contracts
└── docs/                       API, deployment and readiness notes
```

## Production authentication boundary

```text
Browser
  enters HIVE_UI_ACCESS_KEY once
      ↓
Cloudflare Pages Function
  validates the key and issues __Host-hive_session
  HttpOnly + Secure + SameSite=Strict
      ↓
Browser sends only the signed session cookie
      ↓
Cloudflare Pages Function
  validates the session and injects HIVE_ADMIN_TOKEN
      ↓
HIVE backend on Koyeb
```

The UI access key is no longer kept in `sessionStorage` and is not sent with every API request. Rotating `HIVE_UI_ACCESS_KEY` immediately invalidates existing UI sessions.

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Configure the local Vite proxy:

```env
HIVE_API_BASE_URL=https://your-hive-service.koyeb.app
HIVE_ADMIN_TOKEN=your-private-backend-bearer-token
VITE_APP_NAME=HIVE
```

Local Vite development uses a tab-scoped development marker after the login form is submitted. The entered UI key is not stored. The HIVE bearer token remains on the Vite development server and is never compiled into a `VITE_` browser variable.

## Cloudflare Pages deployment

Create a Pages project connected to the `HIVE-UI` GitHub repository.

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
Node.js: 22
```

Configure these values inside **Cloudflare Pages → Settings → Variables and Secrets**:

```text
HIVE_API_BASE_URL             https://your-hive-service.koyeb.app
HIVE_ADMIN_TOKEN              backend bearer token, stored as a secret
HIVE_UI_ACCESS_KEY            separate UI login key, stored as a secret
HIVE_UI_SESSION_TTL_SECONDS   optional, default 43200, range 900–86400
```

Configure Production and Preview separately where required. GitHub repository secrets are not automatically injected into native Cloudflare Pages deployments.

Never create:

```text
VITE_HIVE_ADMIN_TOKEN
VITE_HIVE_UI_ACCESS_KEY
```

Anything prefixed with `VITE_` is eligible for inclusion in the browser bundle.

See [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md) and [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md).

## File storage boundary

The Files route currently performs read/write operations only against the primary HIVE uploads lane. Other configured R2 buckets remain registry-only until scoped backend endpoints are introduced.

See [`docs/STORAGE_SOURCES_ROADMAP.md`](docs/STORAGE_SOURCES_ROADMAP.md).

## Commands

```bash
npm run dev             local Vite development server
npm run typecheck       browser and Pages Function TypeScript checks
npm run lint            ESLint
npm run test:security   signed-session security tests
npm run verify:lock     public npm registry lockfile verification
npm run verify:source   browser-secret and proxy-control checks
npm run build           production build
npm run verify:dist     security headers, secret scan and bundle budgets
npm run check           complete local and CI production gate
npm run preview         preview the production bundle
```

## Required backend contract

The companion HIVE backend provides persistent chat, conversations, models, files, workflow presets, R2 lane metadata, skills, health and operational review endpoints.

See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).
