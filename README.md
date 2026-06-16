# HIVE-UI

Private Cloudflare Pages frontend for **HIVE (Harris Intelligent Virtual Entity)**.

HIVE remains the Python/FastAPI backend on Koyeb. This repository contains the browser interface and a Cloudflare Pages Function that keeps the backend bearer token server-side.

## Current milestone

**Build:** `0.6.0-session-6-polish-deploy`

Sessions 1 to 6 are implemented:

- Vite, React, TypeScript and Tailwind foundation.
- Four primary routes: `/chat`, `/files`, `/skills`, and `/ops`.
- Private UI access-key screen.
- Cloudflare Pages proxy that injects the HIVE backend bearer token server-side.
- Conversation sidebar with search, create, rename and delete actions.
- Persistent streaming chat with stop-generation and scroll-to-latest controls.
- Auto route followed by explicit models from `GET /v1/models`.
- Shared chat interface for normal chat and file chat.
- Multipart file upload, drag-and-drop, pasted-text upload and file metadata inspection.
- File workflow presets and source citation display.
- R2 ecosystem storage map showing active uploads and registry-only lanes.
- Skill search, repo/lane/risk filters, task recommendations, scores and status badges.
- Health flags, workflow graphs, execution previews, repo hygiene and review queues.
- Collapsible right-hand inspector, closed by default.
- Markdown, tables, code blocks, copy controls and message inspection.
- Per-message and conversation-level token/cost display.
- Branded HIVE favicon, touch icons and web manifest.
- Global error recovery, offline state and accessibility improvements.
- Cloudflare security headers, no-index policy and deployment checks.
- GitHub Actions CI plus built-distribution verification.

HIVE-UI does not directly execute skills, mutate repositories or start background jobs. Ops actions create plans, previews and review records only.

## Repository layout

```text
HIVE-UI/
├── .github/workflows/          locked CI verification
├── functions/api/[[path]].ts   Cloudflare Pages Function proxy
├── public/                     brand icons, headers and SPA rules
├── scripts/                    production bundle verification
├── src/components/             shell, chat, status, graph and recovery UI
├── src/context/                auth, chat and inspector state
├── src/hooks/                  browser runtime hooks
├── src/lib/                    typed API/SSE helpers and build metadata
├── src/pages/                  chat, files, skills and ops routes
├── src/types/                  frontend API contracts
└── docs/                       contract, deployment and roadmap notes
```

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Configure:

```env
HIVE_API_BASE_URL=https://your-hive-service.koyeb.app
HIVE_ADMIN_TOKEN=your-private-backend-bearer-token
VITE_APP_NAME=HIVE
```

In local development, Vite proxies `/api/*` to HIVE and inserts `HIVE_ADMIN_TOKEN` on the development server. The bearer token is never exposed through a `VITE_` browser variable.

## Cloudflare Pages deployment

Create a Pages project connected to the `HIVE-UI` GitHub repository.

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
Node.js: 22
```

Configure these variables or secrets **inside the Cloudflare Pages project**:

```text
HIVE_API_BASE_URL   Public base URL of the Koyeb HIVE service
HIVE_ADMIN_TOKEN    Private HIVE backend bearer token
HIVE_UI_ACCESS_KEY  Separate password entered on the HIVE-UI login screen
```

A GitHub repository secret is not automatically available to Cloudflare's native Pages build or Pages Functions runtime. Add Production and Preview values separately where needed.

The browser sends only `X-HIVE-UI-Key` to the Pages Function. The Function validates that key, removes it before forwarding, then injects `Authorization: Bearer <HIVE_ADMIN_TOKEN>` server-side.

Do not create `VITE_HIVE_ADMIN_TOKEN` or `VITE_HIVE_UI_ACCESS_KEY`.

See [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md).

## File storage boundary

The Files route currently performs read/write operations only against the primary HIVE uploads lane. It also reads the backend's safe R2 lane registry and displays other configured ecosystem buckets as **Registry only**.

Future access to audits, transcripts, podcast artefacts, skills and other buckets should be added as scoped backend read-only endpoints first. See [`docs/STORAGE_SOURCES_ROADMAP.md`](docs/STORAGE_SOURCES_ROADMAP.md).

## Required backend contract

The companion HIVE backend provides:

- Persistent `POST /v1/chat/stream` conversations.
- Conversation rename and delete operations.
- Models, file upload/list/read/chat and workflow presets.
- R2 ecosystem lane registry.
- Skill search and recommendations.
- Health, repo hygiene, workflow graph, execution preview and review endpoints.

See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) and [`docs/SESSIONS_1_TO_6.md`](docs/SESSIONS_1_TO_6.md).

## Commands

```bash
npm run dev          # local Vite development server
npm run typecheck    # browser and Pages Function TypeScript checks
npm run lint         # ESLint
npm run build        # production build
npm run verify:dist  # verify deployment files and security policy
npm run preview      # preview the production bundle
npm run check        # typecheck, lint, build and distribution verification
```
