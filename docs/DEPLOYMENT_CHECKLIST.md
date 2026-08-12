> **Document status:** Production reference  
> **Last reviewed:** 22 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI Cloudflare Worker production checklist

## 1. Project configuration

Use the `HIVE-UI` GitHub repository.

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
Node.js: 22
```

The repository pins Node and npm versions, uses a locked dependency tree and rejects non-public package registry URLs.

## 2. Cloudflare Worker variables and secrets

Add these under **Settings → Variables and Secrets** for the Production environment:

```text
HIVE_API_BASE_URL             variable: live HIVE Koyeb HTTPS origin
HIVE_UI_SESSION_TTL_SECONDS   variable: 43200
HIVE_UI_IDLE_TIMEOUT_SECONDS  variable: 1800
KOYEB_SERVICE_ID_HIVE         variable: live HIVE Koyeb service ID
HIVE_COMMS_ACTOR              variable: hive-owner
HIVE_COMMS_ROLE               variable: admin
HIVE_COMMS_URL                variable: https://chat.jonathan-harris.online/console/
HIVE_ADMIN_TOKEN              secret: matches HIVE ADMIN_BEARER_TOKEN
HIVE_UI_ACCESS_KEY            secret: separate high-entropy UI access key
KOYEB_TOKEN                   secret: Koyeb service-control token
HIVE_COMMS_HANDOFF_SECRET     secret: identical to AIMS-UI Worker handoff secret
```

Recommended absolute session TTL and inactivity timeout:

```text
HIVE_UI_SESSION_TTL_SECONDS=43200
HIVE_UI_IDLE_TIMEOUT_SECONDS=1800
```

The absolute session TTL supports 900 to 86400 seconds. Idle timeout supports 300 to 7200 seconds. Rotating `HIVE_UI_ACCESS_KEY` invalidates all active UI sessions.

Configure Preview values separately only when preview deployments need working backend access. Do not expose production credentials to untrusted branch previews.

Never configure any runtime secret with a `VITE_` prefix.

## 3. HIVE backend alignment

Confirm Koyeb uses the matching backend token:

```text
ADMIN_BEARER_TOKEN={{ secret.Hive_API_KEY }}
```

`HIVE_ADMIN_TOKEN` in Cloudflare must contain the resolved token value, not Koyeb's `{{ secret... }}` template.

The Cloudflare Worker gateway calls Koyeb server-to-server. The browser does not need direct Koyeb access during normal production use.

## 4. Production gates before deployment

Run:

```bash
npm ci --no-audit --no-fund
npm run check
npm audit --audit-level=high
```

Expected results:

- lockfile registry verification passes;
- browser source secret scan passes;
- signed-session and communications-handoff security tests pass;
- browser and Worker gateway TypeScript checks pass;
- ESLint passes;
- Vite production build passes;
- no source maps are published;
- no browser chunk exceeds the configured gzip budget;
- no high or critical dependency vulnerabilities are reported.

## 5. Deployment verification

1. Push to `main` and confirm **HIVE-UI CI** succeeds.
2. Confirm Cloudflare Worker builds `dist` successfully.
3. Open the production URL in a private browser tab.
4. Enter `HIVE_UI_ACCESS_KEY` and confirm the console opens.
5. In browser storage tools, confirm an `__Host-hive_session` cookie exists and is marked `HttpOnly`, `Secure` and `SameSite=Strict`.
6. Confirm the access key is absent from Local Storage and Session Storage.
7. Refresh the page and confirm the session restores without re-entering the key.
8. Open `/chat`, send a short Auto route message and confirm streaming persists.
9. Open `/files`, upload a small text file and use the shared file-chat flow.
10. Open `/skills` and `/ops` and confirm authenticated requests succeed.
11. Sign out and confirm the session cookie is cleared and HIVE returns to standby when the UI session woke it.
12. Log in again and confirm HIVE is automatically resumed without a manual Wake control.
13. Confirm genuine clicks/typing/scrolling keep the session active while background polling alone does not.
14. Confirm 30 minutes of no user interaction signs the UI out and returns UI-owned HIVE uptime to standby.
15. Confirm `/api/v1/...` requests without the cookie return `401` with `x-hive-auth-state: session-invalid`.
16. Confirm unknown proxy paths return `404` and do not reach Koyeb.
17. Check one mobile-width and one desktop-width layout.

## 6. Response security checks

The production site and API responses should include:

```text
Content-Security-Policy
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Strict-Transport-Security
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
```

API responses also include:

```text
X-HIVE-UI-Version: 0.11.1
X-Request-ID: <request correlation id>
Cache-Control: no-store, max-age=0
```

## 7. Rollback

Cloudflare Worker retains previous deployments. Roll back to the last known-good deployment if the function or browser build fails post-deployment, then inspect the request ID in the API response and Cloudflare Worker logs.
