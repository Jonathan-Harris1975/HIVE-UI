> **Document status:** Historical implementation record  
> **Last reviewed:** 16 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI v0.7.0 production-readiness report

**Release date:** 16 June 2026  
**Target:** Cloudflare Pages with Pages Functions  
**Backend:** HIVE on Koyeb  
**Backend changes:** None

## Outcome

HIVE-UI has been upgraded from the Session 6 deployment foundation to a production-grade private frontend release.

The existing `/chat`, `/files`, `/skills` and `/ops` functionality is preserved. The principal change is the authentication boundary between the browser, Cloudflare Pages Functions and the HIVE backend.

## Delivered controls

### Authentication and session security

- Removed the UI access key from browser session storage.
- Removed the legacy `X-HIVE-UI-Key` header from browser API traffic.
- Added a same-origin login endpoint that accepts the UI key once.
- Added HMAC-signed `__Host-hive_session` cookies.
- Applied `HttpOnly`, `Secure`, `SameSite=Strict` and host-only cookie rules.
- Added bounded session expiry: 15 minutes minimum, 24 hours maximum, 12 hours default.
- Added access-key comparison hardening.
- Added best-effort per-client failed-login throttling.
- Rotating `HIVE_UI_ACCESS_KEY` invalidates existing sessions immediately.

### Cloudflare proxy hardening

- Restricted forwarding to `/health`, `/livez`, `/readyz` and `/v1/*`.
- Rejected traversal-like, absolute and malformed proxy paths.
- Rejected conflicting cross-origin browser requests.
- Removed browser-controlled authentication, cookie, forwarding and hop-by-hop headers.
- Removed upstream CORS, server and proxy-identifying response headers.
- Rejected unexpected upstream redirects.
- Added request correlation through `X-Request-ID`.
- Distinguished invalid UI sessions from HIVE backend authentication failures.
- Preserved streamed responses and multipart file uploads.

### Browser and response hardening

- Added HSTS, COOP and CORP.
- Retained CSP, anti-framing, no-sniff, permissions and no-index policies.
- Enforced no-store handling for application and API responses.
- Improved login accessibility and error announcement behaviour.
- Kept the branded HIVE favicon and install icons unchanged.

### Supply-chain and build controls

- Locked npm dependencies to the public HTTPS npm registry.
- Added browser-source checks for forbidden secret patterns.
- Added four signed-session security tests.
- Added JavaScript chunk and total gzip budgets.
- Prohibited production source maps.
- Added GitHub dependency auditing and production artifact retention.
- Added weekly Dependabot checks.

## Cloudflare Pages variables

Required:

```text
HIVE_API_BASE_URL
HIVE_ADMIN_TOKEN
HIVE_UI_ACCESS_KEY
```

Optional:

```text
HIVE_UI_SESSION_TTL_SECONDS=43200
```

No `VITE_` secret variables are required or permitted.

## Verification results

```text
npm registry lockfile check: passed
browser source secret check: passed
signed-session tests: 4 passed
browser TypeScript: passed
Pages Function TypeScript: passed
ESLint: passed
Vite production build: passed
distribution verification: passed
JavaScript output: 198 KiB gzip
npm audit: 0 vulnerabilities
```

## Deployment procedure

1. Replace the contents of the `HIVE-UI` repository with this package.
2. Commit and push to `main`.
3. Confirm the `HIVE-UI CI` workflow passes.
4. Confirm the Cloudflare Pages production variables are present.
5. Redeploy the Pages project.
6. Sign in again. Legacy browser access-key storage is intentionally not migrated.
7. Verify chat streaming, file upload/file chat, skills and ops views.
8. Confirm the `__Host-hive_session` cookie is HttpOnly, Secure and SameSite=Strict.

## Deferred by design

- Access to additional R2 buckets remains registry-only.
- Multi-user identity and role-based access are not introduced.
- Durable global rate limiting is not introduced.
- Cloudflare Access remains an optional future outer gate if HIVE-UI becomes multi-user.
