# HIVE-UI picomatch security patch

`picomatch-4.0.8-hive.1.tgz` packages `picomatch` 4.0.7 with a fix for
GHSA-fc5q-39xc-vjpf / CVE-2026-112366. The package version is marked
`4.0.8-hive.1` so npm does not mistake it for the vulnerable registry release.

## Provenance

- Upstream package: `micromatch/picomatch` 4.0.7, MIT licence.
- Patch source: upstream pull request
  <https://github.com/micromatch/picomatch/pull/235> at commit
  `0150ed18b7971894bfd1824c8f96d6b63c70ad1f`.
- Local packaging change: removes the upstream package's development-only
  metadata and an obsolete ESLint suppression.

The patch literalises repeated extglobs containing unbounded glob stars and
branches with whole-string repetition overlap. This prevents the crafted
patterns described by the advisory from compiling into exponentially
backtracking regular expressions.

This intentionally changes glob matching: a repeated extglob is matched as a
literal string if any alternative contains an unbounded `*` (for example,
`+(app*)` or `+(src/**/foo)`), or if its alternatives have whole-string
repetition overlap (for example, `+(ab|abab)`). These patterns no longer match
their usual glob expansions. The root dependency override applies this behavior
to every consumer in the toolchain, including Vite and Vitest. Avoid these
forms in globs that need wildcard matching; use a non-repeated pattern or
separate patterns instead of disabling the safeguard.

## Verification

`scripts/picomatch-security.test.mjs` pins the transformed regular expressions,
checks crafted inputs in a time-bounded child process, and confirms ordinary
extglobs still work. `scripts/verify-lockfile.mjs` requires the exact tarball
path, patched version and SHA-512 integrity recorded by npm.

The standard `npm audit` omits this local `file:` dependency. CI therefore also
runs `scripts/audit-vendored-picomatch.mjs`, which checks the exact locked
package version against npm's advisory endpoint and fails closed if the
endpoint is unavailable or reports an advisory. This supplements rather than
replaces the lockfile integrity check.

Replace the tarball with the first compatible official release that includes an
equivalent fix, then remove the local dependency and override.
