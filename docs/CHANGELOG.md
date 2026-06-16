# HIVE-UI changelog

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
