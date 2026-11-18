# HIVE-UI picomatch security patch

`picomatch-4.0.8-hive.1.tgz` packages `picomatch` 4.0.7 with a narrowly
scoped fix for GHSA-fc5q-39xc-vjpf / CVE-2026-112366. The package version is
marked `4.0.8-hive.1` so npm does not mistake it for the vulnerable registry
release.

## Provenance

- Upstream package: `micromatch/picomatch` 4.0.7, MIT licence.
- Patch source: upstream pull request
  <https://github.com/micromatch/picomatch/pull/235> at commit
  `0150ed18b7971894bfd1824c8f96d6b63c70ad1f`.
- Local packaging changes: removes the upstream package's development-only
  metadata and an obsolete ESLint suppression.

The patch literalises repeated extglobs containing unbounded glob stars and
branches with whole-string repetition overlap. This prevents the crafted
patterns described by the advisory from compiling into exponentially
backtracking regular expressions.

This deliberately changes the behaviour of repeated extglobs containing a glob
star, including `+(*)`, `+(*a)`, `+(a*)`, `*(a*|b)`, `+(**/*.test.js)` and
`src/+(app*)`: picomatch treats the risky extglob as literal text instead of
compiling it. Safe forms such as `+(js|jsx)` and `*(foo|bar)` retain their normal
behaviour. This temporary compatibility trade-off is why replacing the package
with the first official fixed release remains a priority.

The tarball also replaces `REGEX_REMOVE_BACKSLASH`'s lazy bracket expression
with a linear scan. This prevents repeated unmatched `[` characters from
causing quadratic-time backtracking while preserving the existing unescaping
behavior.

## Verification

`scripts/picomatch-security.test.mjs` pins the transformed regular expressions,
checks crafted inputs complete promptly, and confirms ordinary extglobs still
work. It also covers unescaping with repeated unmatched brackets.
`scripts/verify-lockfile.mjs` requires the exact tarball path, patched version
and SHA-512 integrity recorded by npm. Local tarball dependencies are outside
npm's normal audit graph, so `scripts/verify-vendored-advisories.mjs` queries
npm's advisory service for upstream 4.0.7 and fails closed if any advisory
other than the reviewed GHSA-fc5q-39xc-vjpf affects it. CI also continues to run
`npm audit --audit-level=high` for the registry dependency graph; neither check
suppresses high-severity findings. CI supplies the scoped GitHub Actions token
for the advisory fallback to avoid anonymous rate-limit failures; the fallback
still fails closed when advisory evidence is missing or unverified.

Replace the tarball with the first compatible official release that includes an
equivalent fix, then remove the local dependency and override.
