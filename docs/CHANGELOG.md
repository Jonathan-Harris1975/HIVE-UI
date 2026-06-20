> **Document status:** Production reference  
> **Last reviewed:** 16 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI changelog

## 0.9.1 — 16 June 2026

- Hardened model-picker parsing against loose or partially deployed API model metadata.
- Ensured model capability arrays, group names, descriptions and flags are narrowed before rendering.
- Updated GitHub Actions checkout and setup-node actions to v6.
- Reverified TypeScript, ESLint, production build and dependency audit.

## 0.9.0 — 16 June 2026

- Added public Cloudflare Pages health function.
- Added compact two-column repository and operational health cards.
- Integrated HIVE ecosystem health into the Ops inspector.
- Refreshed production, security and operations documentation.

## 0.8.0 - 2026-06-16

### Files and R2

- Added authenticated browsing across every readable R2 lane.
- Added prefix navigation, bounded server-side filename search and cursor pagination.
- Added authoritative metadata, text/document preview and authenticated download controls.
- Added file chat from non-upload buckets; current production lanes can be writable when server-side credentials allow it.
- Kept upload and paste-text controls limited to the primary HIVE uploads lane.

### Models

- Replaced the flat model select with a searchable grouped picker.
- Added HIVE configured, free, reasoning, coding, documents, vision, video analysis, general, audio, image generation and video generation groups.
- Image/video/audio and infrastructure model types are visible and selectable from the grouped model picker.

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
