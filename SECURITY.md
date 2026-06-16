# Security policy

HIVE-UI is a private operations console.

## Supported release

| Version | Supported |
|---|---|
| 0.7.x | Yes |
| 0.6.x and earlier | No |

## Secret handling

Never commit or expose:

- `HIVE_ADMIN_TOKEN`
- `HIVE_UI_ACCESS_KEY`
- Koyeb, R2, D1, Vectorize or OpenRouter credentials

Never prefix server secrets with `VITE_`. Vite-prefixed values may be compiled into browser assets.

Configure production secrets inside Cloudflare Pages Variables and Secrets. Configure backend secrets separately inside Koyeb.

## Incident response

For suspected UI access compromise:

1. Rotate `HIVE_UI_ACCESS_KEY` in Cloudflare Pages.
2. Redeploy the Pages project. Existing signed sessions become invalid.
3. Review Cloudflare Function logs using request IDs.

For suspected backend-token compromise:

1. Rotate the HIVE admin bearer token at its source.
2. Update both Koyeb `ADMIN_BEARER_TOKEN` and Cloudflare `HIVE_ADMIN_TOKEN`.
3. Redeploy both services and verify `/api/health` through HIVE-UI.

Do not place credentials, access keys or live tokens in bug reports, screenshots or repository issues.
