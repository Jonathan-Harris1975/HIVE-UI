# HIVE-UI

Private Cloudflare Pages frontend for **HIVE (Harris Intelligent Virtual Entity)**.

HIVE remains the Python/FastAPI backend on Koyeb. This repository contains the browser interface and a Cloudflare Pages Function that keeps the backend bearer token server-side.

## Current milestone

**Build:** `0.5.1-sessions-1-to-5-cf-install-fix`

Sessions 1 to 5 are implemented:

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
- Skill search, repo/lane/risk filters, task recommendations, scores and status badges.
- Skill-to-chat hand-off using the shared composer.
- Health flags and repository hygiene summaries.
- Interactive workflow graph builder using HIVE plan-only endpoints.
- Controlled execution-preview step statuses.
- Execution review queue with evidence-pack drill-down and review decisions.
- Collapsible right-hand inspector, closed by default.
- Markdown, tables, code blocks, copy controls, loading states and responsive navigation.

HIVE-UI does not directly execute skills, mutate repositories or start background jobs. Ops actions create plans, previews and review records only.

## Repository layout

```text
HIVE-UI/
├── functions/api/[[path]].ts   Cloudflare Pages Function proxy
├── public/                     logo, icons and SPA redirect rule
├── src/components/             shell, status, graph and message components
├── src/context/                auth, chat and inspector state
├── src/lib/                    typed API/SSE helpers and formatting
├── src/pages/                  chat, files, skills and ops routes
├── src/types/                  frontend API contracts
└── docs/                       build and backend contract notes
```

## Local development

```bash
cp .env.example .env.local
npm install
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
Build command: npm run build
Build output directory: dist
Root directory: /
```

The committed lockfile uses the public npm registry and `.npmrc` pins dependency downloads to `https://registry.npmjs.org/`. This prevents Cloudflare Pages from attempting to fetch packages from a build-environment-only registry.

Configure these Pages environment variables or secrets:

```text
HIVE_API_BASE_URL   Public base URL of the Koyeb HIVE service
HIVE_ADMIN_TOKEN    Private HIVE backend bearer token
HIVE_UI_ACCESS_KEY  Separate password entered on the HIVE-UI login screen
```

The browser sends only `X-HIVE-UI-Key` to the Pages Function. The Function validates that key, removes it before forwarding, then injects `Authorization: Bearer <HIVE_ADMIN_TOKEN>` server-side.

Do not create a `VITE_HIVE_ADMIN_TOKEN` variable.

## Required backend contract

The companion HIVE Session 0 backend update provides:

- Persistent `POST /v1/chat/stream` conversations.
- Initial SSE conversation metadata.
- Final SSE persistence status.
- Automatic first-message conversation titles.
- `PATCH /v1/db/conversations/{conversation_id}` for rename.
- `DELETE /v1/db/conversations/{conversation_id}` for removal.

The existing HIVE backend also provides file, skill, workflow graph, execution preview, review queue and repository hygiene endpoints used by Sessions 3 to 5.

See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) and [`docs/SESSIONS_1_TO_5.md`](docs/SESSIONS_1_TO_5.md).

## Commands

```bash
npm run dev        # local Vite development server
npm run typecheck  # browser and Pages Function TypeScript checks
npm run lint       # ESLint
npm run build      # production build
npm run preview    # preview the production bundle
npm run check      # typecheck, lint and build
```

## Remaining Session 6 work

- Deployed Cloudflare Pages and Koyeb integration check.
- Browser-level regression tests against the live HIVE contract.
- Final mobile-device QA and production telemetry refinements.
