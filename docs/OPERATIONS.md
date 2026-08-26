# HIVE-UI production operations

**Status:** Cloudflare Worker production interface  
**Last reviewed:** 22 June 2026

The authenticated `/ops` route displays HIVE runtime flags, repository health, workflows, review state and recent operational events. Repository health includes HIVE-UI and AIMS-UI (`https://chat.jonathan-harris.online/health`) alongside the governed backend and worker services. MAST appears as a Background Worker and is assessed through HIVE's R2 heartbeat probe.

HIVE-UI contains no provider tokens. The Cloudflare Worker gateway holds the HIVE admin token server-side and fetches `/v1/system/ops-events`. See [`OPERATIONAL_ALERTS.md`](OPERATIONAL_ALERTS.md).

After deployment, verify signed login, the four primary routes, alert cards, degraded-state rendering and inspector redaction on desktop and mobile.
