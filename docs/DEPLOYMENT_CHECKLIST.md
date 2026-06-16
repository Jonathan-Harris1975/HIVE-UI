# HIVE-UI Cloudflare Pages deployment checklist

## Project settings

Use the `HIVE-UI` GitHub repository.

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
Node.js: 22
```

The repository includes `.node-version`, package engine constraints, a public-registry `.npmrc`, and a locked dependency tree.

## Cloudflare Pages variables and secrets

Add these inside the **Cloudflare Pages project**, under **Settings → Variables and Secrets**.

```text
HIVE_API_BASE_URL   https://your-hive-service.koyeb.app
HIVE_ADMIN_TOKEN    backend bearer token, stored as a secret
HIVE_UI_ACCESS_KEY  separate UI login key, stored as a secret
```

A GitHub repository secret with the same name is not injected into a native Cloudflare Pages deployment. Configure Production and Preview separately when both environments are used.

Never create `VITE_HIVE_ADMIN_TOKEN` or `VITE_HIVE_UI_ACCESS_KEY`. Variables prefixed with `VITE_` are compiled into the browser bundle.

## Koyeb HIVE configuration

Because the browser calls the same-origin Cloudflare Pages Function, normal UI traffic does not require the browser to call Koyeb directly. Keep the HIVE backend protected by `HIVE_ADMIN_TOKEN`.

For direct development access, keep the required local origin in `CORS_ORIGINS`. For production, include only origins that genuinely need direct backend access.

## Deploy and verify

1. Push the repository contents to `main`.
2. Confirm the GitHub Actions `HIVE-UI CI` workflow passes.
3. Confirm Cloudflare Pages runs `npm run build` successfully.
4. Open the production URL and enter `HIVE_UI_ACCESS_KEY`.
5. Confirm the header health badge reports the HIVE backend build.
6. Open `/chat`, send a short Auto route request, and confirm streaming persists.
7. Refresh the page and reopen the conversation.
8. Open `/files`, upload a small text file, and chat with it.
9. Expand **Storage map** and confirm configured lanes appear as registry-only unless they are the uploads lane.
10. Open `/skills` and `/ops` and confirm authenticated API requests succeed.
11. Check browser developer tools for CSP, mixed-content or failed API errors.
12. Test one mobile-width view and one desktop-width view.

## Expected security behaviour

- Search engines receive `noindex` and `robots.txt` disallows the site.
- The UI cannot be embedded in an external frame.
- The backend bearer token is never returned to the browser.
- The browser stores only the separate UI access key in session storage.
- Closing the tab clears that browser session key.
