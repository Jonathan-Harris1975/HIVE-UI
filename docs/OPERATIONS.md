# HIVE-UI production operations

**Status:** Production-controlled  
**Last reviewed:** 16 June 2026

Deploy from `main` to Cloudflare Pages with `npm ci --no-audit --no-fund && npm run check` and output directory `dist`. Configure `HIVE_API_BASE_URL`, `HIVE_ADMIN_TOKEN` and `HIVE_UI_ACCESS_KEY` as encrypted production variables.

After deployment, verify `/health`, sign in, load `/chat`, browse one R2 lane, inspect model groups and open `/ops`. Repository health cards should render in a compact two-column grid on supported widths and collapse cleanly on mobile.

Roll back from Cloudflare Pages Deployments or revert the commit. Rotating the UI access key invalidates new logins; changing the session-signing input deliberately expires existing sessions.
