# HIVE-UI

HIVE-UI is the private React/TypeScript operator interface for HIVE. The browser application is built with Vite and React Router, while a Cloudflare Worker gateway serves the production assets, owns authentication/session handling, and proxies approved HIVE API paths without exposing the HIVE admin bearer token to browser JavaScript.

## Architecture and primary flows

The production request path is:

```text
Browser -> Cloudflare Worker gateway -> HIVE backend
             |       |
             |       +-> LOGIN_RATE_LIMITER Durable Object
             +-> signed __Host-hive_session cookie
```

Primary user flows include:

- authenticated HIVE conversations and file chat with citations;
- file upload, R2-lane browsing and storage-backed file workflows;
- repository intelligence and Repository Memory views;
- execution planning/review, optimisation and monthly-review workflows;
- operational evidence for HIVE, AIMS, RAMS and the website;
- a signed HIVE-to-AIMS Communications hand-off; and
- model registry and integration views.

The React application uses `BrowserRouter` with declarative `Routes`, nested under `AppShell`. Authentication is resolved before protected routes render. Legacy `/memory` requests redirect to `/intelligence` while preserving the query string, `/execution-simulation` redirects to `/execution`, and unknown application routes redirect to `/chat`.

## Main routes

| Route | Purpose |
|---|---|
| `/chat` | Conversations and file chat |
| `/files` | Uploads and configured storage lanes |
| `/repositories` | Repository catalogue |
| `/intelligence` | Repository intelligence and memory workspace |
| `/integrations` | Integration status and configuration views |
| `/council` | Council workflow |
| `/execution` | Execution planning |
| `/execution-reviews` | Execution review and evidence workflow |
| `/optimisation` | Recorded optimisation decisions and experiments |
| `/monthly-review` | Monthly review workflow |
| `/models` | Model registry |
| `/communications` | Embedded AIMS Comms Hub |
| `/ops` | Ecosystem health and operations |
| `/health` | Public Worker health endpoint |

## Authentication, sessions and login rate limiting

Login is handled by the Worker at the same origin. The browser submits `HIVE_UI_ACCESS_KEY`; the Worker compares it in constant time and, on success, issues a signed `__Host-hive_session` cookie with `HttpOnly`, `Secure` and `SameSite=Strict`. `HIVE_UI_SESSION_SECRET` is mandatory and independent from the login access key. Missing signing secrets fail closed with HTTP 503.

Failed-login protection is globally coordinated per client key through the `LOGIN_RATE_LIMITER` Durable Object. The Worker names the Durable Object from the Cloudflare connecting IP when available, otherwise from a bounded user-agent fallback. The Durable Object persists one `attempt` record containing the failure count and fixed-window reset timestamp.

The implemented limiter semantics are:

- the first failed login starts a 10-minute fixed window;
- each failure in that window increments the stored count;
- the fifth failed attempt blocks further login attempts until the original window expires and returns HTTP 429 with `Retry-After`;
- an expired record is deleted on the next limiter request;
- a successful credential check clears the stored failure record before the session is issued; and
- if the binding, Durable Object or limiter request is unavailable, login fails closed with HTTP 503 and `login_rate_limiter_unavailable`.

The binding and migration in `wrangler.toml` are production requirements, not optional enhancements:

```toml
[[durable_objects.bindings]]
name = "LOGIN_RATE_LIMITER"
class_name = "LoginRateLimiter"

[[migrations]]
tag = "login-rate-limiter-v1"
new_sqlite_classes = ["LoginRateLimiter"]
```

An outage of this limiter blocks new login completion, including the failure-state clear performed after a valid credential. Existing authenticated sessions are not revalidated through the limiter and can continue until their normal session/idle expiry, subject to the availability of the requested backend service.

## AIMS Communications hand-off

The Communications page requests `/api/auth/comms-handoff`, validates that the returned destination is `https://chat.jonathan-harris.online/console/`, and embeds the operator console only after the signed hand-off succeeds. A dedicated `HIVE_COMMS_HANDOFF_SECRET` is mandatory and is validated through `/api/auth/comms-identity`. HIVE-UI does not derive hand-off signing material from the access credential.

## Configuration

Use `.env.example` as a safe inventory of Worker variables and secret names. Do not place production secret values in source control or any `VITE_` variable.

Required secret material includes:

- `HIVE_ADMIN_TOKEN` for the Worker-to-HIVE backend connection;
- `HIVE_UI_ACCESS_KEY` for login verification;
- `HIVE_UI_SESSION_SECRET` for independent UI-session signing;
- `HIVE_COMMS_HANDOFF_SECRET` for independent HIVE-to-AIMS hand-off signing; and
- `KOYEB_TOKEN` when lifecycle control is enabled.

Required Cloudflare resource configuration includes the `LOGIN_RATE_LIMITER` Durable Object binding and its `LoginRateLimiter` SQLite migration. See `wrangler.toml`, `docs/DEPLOYMENT_CHECKLIST.md` and `SECURITY.md` for the production contract.

## Local development and verification

Use the repository-pinned Node/npm versions from `package.json`.

```bash
npm ci --no-audit --no-fund
npm run dev
```

The canonical pre-deployment verification path is:

```bash
npm run verify:lock
npm run verify:source
npm run test:security
npm run test:ux-contract
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run verify:dist
npm run check:bundle-budget
npm run secret:scan
npm audit --audit-level=high
```

`npm run check` combines the lock/source, security, UX-contract, TypeScript, ESLint, unit, production-build and dist-verification gates. Run `npm run test:e2e` as a deployed/integration gate where Playwright's configured target is available.

## Cloudflare deployment and operations

Production deploys the validated `dist` assets through the Worker on `https://hive.jonathan-harris.online`.

Before deployment:

1. confirm the Worker variables/secrets in `docs/DEPLOYMENT_CHECKLIST.md`;
2. confirm `LOGIN_RATE_LIMITER` still maps to `LoginRateLimiter` and the migration remains declared;
3. run the full verification gates above; and
4. deploy through the canonical Worker path (`npm run deploy` or the repository CI deployment workflow).

After deployment, verify `/health`, signed login, protected routes, logout, a deliberate invalid-login sequence, the expected 429/`Retry-After` behaviour at the configured threshold, and the HIVE/AIMS hand-off. Treat `login_rate_limiter_unavailable` 503 responses as an authentication-protection outage: restore the Durable Object binding/service rather than bypassing the limiter.

Interactive HIVE/AIMS lifecycle control is session-driven: login can resume required services, user activity refreshes the idle window, and logout/idle handling pauses only services claimed by that UI session. Services already active for MAST governance remain under MAST ownership.

The Ops view displays redacted provider/runtime events supplied by HIVE, including supported GitHub, Koyeb and Cloudflare failures. See `docs/OPERATIONAL_ALERTS.md` and `docs/OPERATIONS.md`.
