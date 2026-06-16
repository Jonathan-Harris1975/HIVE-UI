# HIVE-UI changelog

## 0.8.0 - 2026-06-16

### Files and R2

- Added authenticated browsing across every readable R2 lane.
- Added prefix navigation, bounded server-side filename search and cursor pagination.
- Added authoritative metadata, text/document preview and authenticated download controls.
- Added file chat from non-upload buckets while preserving read-only enforcement.
- Kept upload and paste-text controls limited to the primary HIVE uploads lane.

### Models

- Replaced the flat model select with a searchable grouped picker.
- Added HIVE configured, free, reasoning, coding, documents, vision, video analysis, general, audio, image generation and video generation groups.
- Image/video generation models are visible but disabled in standard chat pending a dedicated creation workspace.

### Security and CI

- Added canonical Base64URL validation for signed UI sessions.
- Updated GitHub checkout and setup-node actions to their Node 24-capable major releases.
- Preserved the browser-secret source gate that caught the earlier legacy access-key string.

## 0.7.0 - 2026-06-16

### Security

- Replaced per-request UI access-key headers and browser key storage with signed HttpOnly sessions.
- Added `__Host-hive_session` with Secure and SameSite=Strict attributes.
- Added bounded session expiry, access-key comparison hardening and login throttling.
- Added same-origin request checks, proxy path allowlisting and header sanitisation.
- Added request IDs and distinct UI-session failure signalling.
- Added HSTS, COOP and CORP headers.

### Reliability and operations

- UI sessions now survive temporary backend outages.
- Backend authentication failures no longer masquerade as an expired UI session.
- Added explicit production deployment and rollback checks.

### Supply chain and CI

- Added public npm registry lockfile verification.
- Added signed-session tests and browser secret-pattern checks.
- Added JavaScript bundle budgets and stricter dist verification.
- Added dependency auditing, build artifact retention and Dependabot.

## 0.6.0

- Completed Session 6 polish, branded deployment assets, error recovery, responsive improvements and Cloudflare Pages foundations.
