# HIVE-UI production operations

**Status:** Cloudflare Worker production interface  
**Last reviewed:** 20 September 2026

The authenticated `/ops` route displays HIVE runtime flags, repository health, workflows, review state and recent operational events. Repository health includes HIVE-UI and AIMS-UI (`https://chat.jonathan-harris.online/health`) alongside the governed backend and worker services. MAST appears as a Background Worker and is assessed through HIVE's R2 heartbeat probe.

HIVE-UI contains no provider tokens. The Cloudflare Worker gateway holds the HIVE admin token server-side and fetches `/v1/system/ops-events`. See [`OPERATIONAL_ALERTS.md`](OPERATIONAL_ALERTS.md).

After deployment, verify signed login, representative protected routes, alert cards, degraded-state rendering and inspector redaction on desktop and mobile.


## Login-protection operations

New logins depend on the `LOGIN_RATE_LIMITER` Durable Object binding and the exported `LoginRateLimiter` class. The limiter persists failed-login state for the implemented fixed 10-minute window and blocks from the fifth failure until that window expires. The binding and SQLite migration are defined in `wrangler.toml` and are deployment requirements.

`login_rate_limiter_unavailable` with HTTP 503 means the authentication protection path is unavailable. Treat it as a Worker/Durable Object incident: verify the binding, migration and Durable Object availability, then restore the protected path. Do not bypass the limiter or convert the failure to a permissive login path. Existing signed sessions are not revalidated through this limiter and remain subject to their normal absolute/idle expiry and downstream-service availability.
