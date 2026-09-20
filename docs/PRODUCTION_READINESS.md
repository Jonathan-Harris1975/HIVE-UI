> **Document status:** Production reference  
> **Last reviewed:** 20 September 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI production-readiness record

**Current UI marker:** `0.12.0`.

## Security boundary

- HIVE backend bearer token remains inside the Cloudflare Worker gateway.
- UI access key is submitted only to the same-origin login endpoint.
- Browser storage does not contain the UI access key.
- Sessions use a signed `__Host-` cookie with `HttpOnly`, `Secure` and `SameSite=Strict`.
- Session expiry is bounded between 15 minutes and 24 hours.
- Access-key comparison hashes both values before a fixed-length comparison.
- Failed-login protection is enforced by the `LOGIN_RATE_LIMITER` Durable Object and is globally coordinated for each derived client key.
- Mutating and proxied requests reject conflicting cross-origin signals.
- Proxy paths are allowlisted and traversal-like paths are denied.
- Browser-controlled authentication, forwarding and hop-by-hop headers are stripped.
- Backend redirects are rejected rather than leaking a Koyeb destination to the browser.
- API responses use no-store caching, hardened headers and request correlation IDs.

## Durable Object login limiter

`LOGIN_RATE_LIMITER` is a required Cloudflare Durable Object namespace bound to the exported `LoginRateLimiter` class. The Worker derives a client key from `CF-Connecting-IP` where available, otherwise from a bounded user-agent fallback, and uses that key to select the Durable Object instance.

The Durable Object stores one `attempt` record in Durable Object storage with:

- `failures`: number of failed login attempts in the current window; and
- `resetAt`: absolute timestamp at which the current fixed window expires.

Current semantics are exactly those implemented in `workers/gateway/index.ts`:

1. The first failed login creates `{ failures: 1, resetAt: now + 10 minutes }`.
2. Subsequent failures increment `failures` while retaining that original `resetAt`; the window is fixed rather than sliding.
3. The fifth failure reaches the block threshold. The login response is HTTP 429 with a `Retry-After` value derived from the remaining window.
4. Once `resetAt` has passed, the stored record is deleted on the next limiter request and login can be attempted again.
5. A valid access key triggers a limiter `DELETE`; the Worker issues a session only after the failure record has been cleared successfully.
6. If the binding is absent, the Durable Object call fails, or the limiter returns a non-success response, login fails closed with HTTP 503 and `login_rate_limiter_unavailable`.

The production Wrangler contract is:

```toml
[[durable_objects.bindings]]
name = "LOGIN_RATE_LIMITER"
class_name = "LoginRateLimiter"

[[migrations]]
tag = "login-rate-limiter-v1"
new_sqlite_classes = ["LoginRateLimiter"]
```

Operationally, a limiter outage blocks new login completion rather than reducing authentication protection. Existing signed sessions do not consult the limiter and remain governed by their normal absolute/idle expiry and the availability of downstream services. Operators should investigate `login_rate_limiter_unavailable` 503 responses and restore the binding/Durable Object path; they must not introduce a fail-open bypass.

`scripts/verify-source.mjs` checks that the Worker source, Wrangler binding/migration and production documentation continue to agree on this contract.

## Browser and build controls

- CSP allows network connections only to the same origin.
- HSTS, COOP, CORP, anti-framing, no-sniff and no-index headers are present.
- Production source maps are prohibited.
- Browser bundles are scanned for backend/UI secret patterns.
- JavaScript and CSS gzip output are measured from every production build, written to `dist/bundle-metrics.json`, surfaced in the GitHub Actions step summary and constrained by reviewed hard budgets in `config/bundle-budget.json`.
- The npm lockfile is restricted to the public HTTPS npm registry.
- CI performs TypeScript, ESLint, security tests, production build, dist verification, measured bundle-budget enforcement and dependency audit.
- Dependabot checks npm dependencies weekly.

## Routing compatibility

The application uses React Router in declarative mode through `BrowserRouter`, `Routes`, `Route`, `Navigate` and `useLocation`. It does not currently use data-router loaders/actions or the unstable route-pattern-matching feature introduced upstream. Legacy redirects and browser-history replacement semantics are implemented with `<Navigate replace>`.

React Router is deliberately pinned to `8.4.0` in the manifest so release adoption is explicit. That release's internal context changes do not require application route changes for the current declarative routing model.

## Operational behaviour

- UI sessions remain valid during a temporary Koyeb outage, allowing the console to show clear backend errors instead of repeatedly requesting the UI key.
- UI-session failures are distinguished from backend bearer-token failures.
- Login-protection failures are surfaced separately as `login_rate_limiter_unavailable` and fail closed with HTTP 503.
- `X-Request-ID` links browser failures to Cloudflare and HIVE logs.
- Cloudflare retains prior deployments for rapid rollback.

## Intentionally deferred

- Multi-user identity and role-based access control.
- Cloudflare Access or an external identity provider.
- Read/write access to additional R2 buckets.
- Public indexing, analytics trackers or third-party browser telemetry.

These controls are genuinely unimplemented and are not required for the current single-owner private console. Cloudflare Access would be the natural next security layer if HIVE-UI later gains multiple users.

## September 2026 remediation update

- Reconciled authentication documentation with the implemented Durable Object limiter and fail-closed login path.
- Added source/documentation checks for the required Durable Object binding and migration so the deployment contract cannot silently disappear.
- Tightened React Router to the reviewed `8.4.0` release and documented routing compatibility expectations.
- Corrected environment guidance so mandatory independent signing secrets are no longer described as optional.

## August 2026 release-governance updates

- Cloudflare Workers observability is explicitly enabled, with logs and traces retained as separate explicit controls.
- `scripts/verify-source.mjs` fails if observability is disabled or the Worker `UI_VERSION` drifts from `package.json`.
- The obsolete v0.7.0 bundle measurement is no longer treated as a current baseline. CI now emits the actual bundle sizes for every build, creating reviewable evidence for future budget ratcheting.
