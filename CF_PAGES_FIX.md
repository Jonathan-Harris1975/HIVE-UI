# Cloudflare Pages dependency-install fix

## Failure observed

Cloudflare Pages cloned the repository successfully, detected Node.js 22.16.0 and npm 10.9.2, then failed during `npm clean-install` with `Exit handler never called!`.

## Root cause

The committed `package-lock.json` contained 312 tarball URLs pointing to an internal build registry. That host is not available to Cloudflare Pages, so npm stalled while resolving dependencies and eventually terminated with its generic exit-handler error.

## Changes

- Replaced all internal tarball URLs in `package-lock.json` with public `https://registry.npmjs.org` URLs while preserving exact package versions and integrity hashes.
- Added `.npmrc` to pin the npm registry and disable unnecessary install-time progress, funding and audit requests.
- Declared Node.js 22.x and npm 10.x for reproducible Cloudflare builds.
- Bumped the frontend package version to 0.5.1.

## Verified commands

```bash
npm clean-install --progress=false
npm run check
```

Both commands pass under Node.js 22.16.0 and npm 10.9.2, matching the versions shown in the Cloudflare Pages log.
