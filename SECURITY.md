# HIVE-UI security policy

**Status:** Production-controlled  
**Last reviewed:** 20 September 2026

HIVE-UI uses a Cloudflare Worker gateway to protect HIVE credentials. The browser submits the UI access key during same-origin login; the gateway validates it and issues a signed `HttpOnly`, `Secure`, `SameSite=Strict` `__Host-hive_session` cookie. The backend bearer token is injected only inside the server-side proxy.

Production controls include constant-time credential comparison, canonical session encoding, strict proxy path allow-listing, request and response header sanitisation, path-traversal rejection, restrictive browser headers and source/distribution secret scans.

## Login rate-limiter security boundary

Failed-login throttling is enforced by the `LOGIN_RATE_LIMITER` Durable Object binding. It is not a best-effort browser/edge-memory control and is not deferred work.

For each client key, the `LoginRateLimiter` Durable Object persists an `attempt` record containing the failure count and fixed-window reset timestamp. The first failed login begins a 10-minute window; the fifth failure blocks login until that window expires and produces HTTP 429 with `Retry-After`. A successful credential check clears the stored failures before a session is issued.

Authentication is deliberately fail closed. If `LOGIN_RATE_LIMITER` is missing, the Durable Object cannot be reached, or the limiter returns a non-success response, the Worker returns HTTP 503 with `login_rate_limiter_unavailable`. Do not add a fallback that bypasses this check.

`wrangler.toml` must retain both the `LOGIN_RATE_LIMITER` -> `LoginRateLimiter` binding and the `login-rate-limiter-v1` SQLite-class migration. Deployment checks must verify both before exposing the login endpoint.

## Secret handling

`HIVE_UI_SESSION_SECRET` and `HIVE_COMMS_HANDOFF_SECRET` are mandatory independent secrets. They must never fall back to, or be derived from, `HIVE_UI_ACCESS_KEY`. Do not add `HIVE_ADMIN_TOKEN`, provider secrets, R2 credentials or authentication secrets to Vite variables, source files or browser storage.

Report suspected authentication bypasses, token exposure or rate-limiter failures privately to the repository owner.
