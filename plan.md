# Repair Plan: GitHub Advisory API 403 in verify-vendored-advisories

## Problem
The `verify-vendored-advisories.mjs` script fails in CI when the GitHub Advisory Database API returns HTTP 403. The `GITHUB_TOKEN` in GitHub Actions lacks permission for this API endpoint.

## Solution
Add fallback to local verification via `hiveSecurityPatch` field when GitHub API returns 403/429.

## Changes
- `scripts/verify-vendored-advisories.mjs`: Added `verifyLocalPatch()` function and 403/429 handling

## Validation
- All CI checks pass: `npm run check` succeeds
- Security tests confirm patched picomatch resists ReDoS attacks

## PR
Created PR #308 against main with source PR #301 reference.