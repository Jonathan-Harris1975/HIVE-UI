# HIVE-UI production operations

**Status:** Cloudflare Pages production interface  
**Last reviewed:** 17 June 2026

The authenticated `/ops` route displays HIVE runtime flags, repository health, workflows, review state and recent operational events. MAST appears as a Background Worker and is assessed through HIVE's R2 heartbeat probe.

HIVE-UI contains no provider tokens. The Cloudflare Pages Function proxy holds the HIVE admin token server-side and fetches `/v1/system/ops-events`. See [`OPERATIONAL_ALERTS.md`](OPERATIONAL_ALERTS.md).

After deployment, verify signed login, the four primary routes, alert cards, degraded-state rendering and inspector redaction on desktop and mobile.
