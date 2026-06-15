# HIVE UI

Frontend for **HIVE** (Harris Intelligent Virtual Entity) — the personal AI assistant for Jonathan Harris's content ecosystem.

## Stack

- **Vite + React 18 + TypeScript** — fast builds, strict types
- **Tailwind CSS** — utility-first, HIVE palette derived from jonathan-harris.online
- **React Router v6** — 4 views (Chat, Files, Skills, Ops)
- **No UI library dependencies** — all components built from scratch

## Views

| Route | View | Purpose |
|-------|------|---------|
| `/chat` | Chat | Streaming conversations with mode/model selection |
| `/chat/:id` | Chat | Resume a persisted conversation |
| `/files` | Files | Upload, chunk, vectorize documents |
| `/skills` | Skills | Search and recommend skills from register |
| `/ops` | Ops | Health, workflow graph, review queue, hygiene |

## Local Development

```bash
# Install
npm install

# Copy env
cp .env.example .env.local
# Edit .env.local — leave VITE_HIVE_API_URL blank to use Vite proxy

# Start HIVE backend (separate terminal)
# Then:
npm run dev
```

The Vite dev server proxies `/v1/*` and `/health` to `http://localhost:8000`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_HIVE_API_URL` | HIVE backend URL. Empty = use Vite proxy (local dev). Set to Koyeb URL for production. |

## Auth

HIVE UI uses bearer token auth. On first load, a token gate prompts for your `HIVE_ADMIN_BEARER_TOKEN`. The token is held **in memory only** — never stored in localStorage or cookies. Refreshing the page requires re-entering the token.

## Production Deploy

Deploy to **Cloudflare Pages** via GitHub Actions (`.github/workflows/deploy.yml`).

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_HIVE_API_URL` — your Koyeb HIVE backend URL

HIVE backend CORS must allow the Cloudflare Pages domain:
```python
# HIVE backend config
CORS_ORIGINS=["https://hive-ui.pages.dev", "https://your-custom-domain.com"]
```

## Colour Palette

Derived from jonathan-harris.online, shifted 4 shades lighter:

```
hive-bg:         #1c2a3e   Background
hive-surface:    #243348   Cards, panels
hive-surfaceHi:  #2e4060   Hover, active surfaces
hive-border:     #364e6b   Dividers
hive-accent:     #7c75ed   Primary accent (lightened from #4f46e5)
hive-text:       #dde5f0   Primary text
hive-textSoft:   #8892a4   Secondary text
hive-textDim:    #5a6880   Tertiary / disabled
hive-blue:       #b8d9fe   Info / links
hive-success:    #34d399   Green
hive-warning:    #fbbf24   Amber
hive-error:      #f87171   Red
```

## Repository Structure

```
src/
├── api/
│   ├── client.ts          # Core fetch wrapper + SSE streaming
│   └── hive.ts            # All typed HIVE endpoint functions
├── components/
│   ├── chat/
│   │   ├── ChatInput.tsx        # Message input + mode/model controls
│   │   ├── ConversationSidebar.tsx
│   │   ├── MessageBubble.tsx    # Renders messages with markdown
│   │   ├── ModeSelector.tsx
│   │   └── ModelPicker.tsx
│   ├── layout/
│   │   ├── AppShell.tsx         # Nav sidebar + page wrapper
│   │   └── TokenGate.tsx        # Auth screen
│   └── shared/
│       └── index.tsx            # Spinner, Badge, EmptyState, Flag, KVRow etc.
├── hooks/
│   ├── useAuth.ts
│   ├── useConversations.ts
│   └── useModels.ts
├── store/
│   └── auth.ts                  # In-memory auth store
├── types/
│   └── index.ts                 # All TypeScript types
├── utils/
│   └── index.ts                 # Formatting, markdown, colour helpers
└── views/
    ├── ChatView.tsx
    ├── FilesView.tsx
    ├── OpsView.tsx
    └── SkillsView.tsx
```

## HIVE Backend Compatibility

Tested against HIVE **v1.22+**. Requires:

- `GET /health` — health flags
- `GET /healthz` — liveness probe
- `GET /v1/models` — model list
- `POST /v1/chat/stream` — SSE streaming chat
- `POST /v1/chat` — non-streaming chat
- `GET /v1/db/conversations` — conversation list
- `GET /v1/db/conversations/:id` — conversation detail
- `POST /v1/files/upload` — file upload
- `GET /v1/files/list` — file list
- `GET /v1/skills/search` — skill search
- `POST /v1/skills/recommend` — skill recommendation
- `GET /v1/workflow-graphs/templates` — graph templates
- `POST /v1/execution-preview` — execution preview
- `GET/POST /v1/execution-reviews` — review queue
- `GET /v1/system/repo-hygiene` — hygiene report
