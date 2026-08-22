> **Document status:** Production reference  
> **Last reviewed:** 22 August 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI production-readiness record

**Current UI marker:** `0.12.0`.

## Security boundary

- HIVE backend bearer token remains inside Cloudflare Worker gateway.
- UI access key is submitted only to the same-origin login endpoint.
- Browser storage no longer contains the UI access key.
- Sessions use a signed `__Host-` cookie with `HttpOnly`, `Secure` and `SameSite=Strict`.
- Session expiry is bounded between 15 minutes and 24 hours.
- Access-key comparison hashes both values before a fixed-length comparison.
- Failed login attempts receive best-effort per-client edge throttling.
- Mutating and proxied requests reject conflicting cross-origin signals.
- Proxy paths are allowlisted and traversal-like paths are denied.
- Browser-controlled authentication, forwarding and hop-by-hop headers are stripped.
- Backend redirects are rejected rather than leaking a Koyeb destination to the browser.
- API responses use no-store caching, hardened headers and request correlation IDs.

## Browser and build controls

- CSP allows network connections only to the same origin.
- HSTS, COOP, CORP, anti-framing, no-sniff and no-index headers are present.
- Production source maps are prohibited.
- Browser bundles are scanned for backend/UI secret patterns.
- JavaScript and CSS gzip output are measured from every production build, written to `dist/bundle-metrics.json`, surfaced in the GitHub Actions step summary and constrained by reviewed hard budgets in `config/bundle-budget.json`.
- The npm lockfile is restricted to the public HTTPS npm registry.
- CI performs TypeScript, ESLint, security tests, production build, dist verification, measured bundle-budget enforcement and dependency audit.
- Dependabot checks npm dependencies weekly.

## Operational behaviour

- UI sessions remain valid during a temporary Koyeb outage, allowing the console to show clear backend errors instead of repeatedly requesting the UI key.
- UI-session failures are distinguished from backend bearer-token failures.
- `X-Request-ID` links browser failures to Cloudflare and HIVE logs.
- Cloudflare retains prior deployments for rapid rollback.

## Intentionally deferred

- Multi-user identity and role-based access control.
- Cloudflare Access or an external identity provider.
- Durable global rate limiting using KV or Durable Objects.
- Read/write access to additional R2 buckets.
- Public indexing, analytics trackers or third-party browser telemetry.

These are not required for the current single-owner private console. Cloudflare Access would be the natural next security layer if HIVE-UI later gains multiple users.

## August 2026 release-governance updates

- Cloudflare Workers observability is explicitly enabled, with logs and traces retained as separate explicit controls.
- `scripts/verify-source.mjs` fails if observability is disabled or the Worker `UI_VERSION` drifts from `package.json`.
- The obsolete v0.7.0 bundle measurement is no longer treated as a current baseline. CI now emits the actual bundle sizes for every build, creating reviewable evidence for future budget ratcheting.
