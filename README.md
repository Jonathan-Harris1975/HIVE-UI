# HIVE-UI

Private Cloudflare Pages frontend for **HIVE (Harris Intelligent Virtual Entity)**.

HIVE remains the Python/FastAPI backend on Koyeb. This repository contains the browser interface, a Cloudflare Pages Function that protects the backend bearer token, and the first operator-console screens.

## Current milestone

**Build:** `0.1.0-foundation`

Implemented:

- Vite, React, TypeScript and Tailwind foundation.
- Four primary routes: `/chat`, `/files`, `/skills`, and `/ops`.
- Private access-key screen.
- Cloudflare Pages proxy that injects the HIVE backend bearer token server-side.
- Conversation sidebar with search, create, rename and delete actions.
- Streaming chat with stop-generation support.
- Auto route followed by explicit models from `GET /v1/models`.
- Shared chat interface for normal chat and file chat.
- File upload, listing, metadata inspection and workflow preset selection.
- Skill search, registry filters and task recommendations.
- Health flags, repository hygiene, workflow templates and review-queue data.
- Collapsible right-hand inspector, closed by default.
- Markdown, tables, code blocks, copy controls, loading states and responsive navigation.

## Repository layout

```text
HIVE-UI/
├── functions/api/[[path]].ts   Cloudflare Pages Function proxy
├── public/                     logo, icons and SPA redirect rule
├── src/components/             shell, login and message components
├── src/context/                auth, chat and inspector state
├── src/lib/                    typed API/SSE helpers and formatting
├── src/pages/                  chat, files, skills and ops routes
├── src/types/                  frontend API contracts
└── docs/                       build and backend contract notes
```

## Local development

```bash
cp .env.example .env.local
# Add the Koyeb HIVE URL and backend bearer token to .env.local
npm install
npm run dev
```

Open the local Vite URL and enter any non-empty UI access key. In local mode, Vite proxies `/api/*` to HIVE and inserts `HIVE_ADMIN_TOKEN` on the development server. The bearer token is not exposed through a `VITE_` browser variable.

### Local environment

```env
HIVE_API_BASE_URL=https://your-hive-service.koyeb.app
HIVE_ADMIN_TOKEN=your-private-backend-bearer-token
VITE_APP_NAME=HIVE
```

## Cloudflare Pages deployment

Create a Pages project connected to the `HIVE-UI` GitHub repository.

```text
Build command: npm run build
Build output directory: dist
Root directory: /
```

Configure these Pages environment variables/secrets:

```text
HIVE_API_BASE_URL   Public base URL of the Koyeb HIVE service
HIVE_ADMIN_TOKEN    Private HIVE backend bearer token
HIVE_UI_ACCESS_KEY  Separate password entered on the HIVE-UI login screen
```

The browser sends only `X-HIVE-UI-Key` to the Pages Function. The Function validates that key, removes it before forwarding, then injects `Authorization: Bearer <HIVE_ADMIN_TOKEN>` server-side. Do not create a `VITE_HIVE_ADMIN_TOKEN` variable.

## Required backend contract

The companion HIVE Session 0 backend update provides:

- Persistent `POST /v1/chat/stream` conversations.
- An initial SSE conversation metadata event.
- A final SSE event containing persistence status.
- Automatic first-message conversation titles.
- `PATCH /v1/db/conversations/{conversation_id}` for rename.
- `DELETE /v1/db/conversations/{conversation_id}` for removal.

See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

## Commands

```bash
npm run dev        # local Vite development server
npm run typecheck  # browser and Pages Function TypeScript checks
npm run lint       # ESLint
npm run build      # production build
npm run preview    # preview the production bundle
npm run check      # typecheck, lint and build
```

## Next build slices

1. Wire execution graph previews into an interactive node view.
2. Add review decisions and evidence-pack drill-down to Ops.
3. Add conversation clone/export and slash-command search.
4. Add richer source cards and file chunk inspection.
5. Run browser-level tests against the deployed HIVE contract.
