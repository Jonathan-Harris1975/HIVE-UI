# HIVE-UI security policy

**Status:** Production-controlled  
**Last reviewed:** 22 June 2026

HIVE-UI uses a Cloudflare Pages Function to protect HIVE credentials. The browser submits the UI access key during login; the function validates it and issues a signed `HttpOnly`, `Secure`, `SameSite=Strict` session cookie. The backend bearer token is injected only inside the server-side proxy.

Production controls include login throttling, constant-time credential comparison, canonical session encoding, strict proxy path allow-listing, request and response header sanitisation, path-traversal rejection, restrictive browser headers and source/distribution secret scans.

Do not add `HIVE_ADMIN_TOKEN`, provider secrets or R2 credentials to Vite variables, source files or browser storage. Report suspected bypasses or token exposure privately to the repository owner.
