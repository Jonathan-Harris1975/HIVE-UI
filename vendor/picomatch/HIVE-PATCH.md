# HIVE-UI picomatch security patch

This directory vendors `picomatch` 4.0.7 with a narrowly scoped fix for
GHSA-fc5q-39xc-vjpf / CVE-2026-112366. The package version is marked
`4.0.8-hive.1` so npm does not mistake it for the vulnerable registry release.

## Provenance

- Upstream package: `micromatch/picomatch` 4.0.7, MIT licence.
- Patch source: upstream pull request
  <https://github.com/micromatch/picomatch/pull/235> at commit
  `0150ed18b7971894bfd1824c8f96d6b63c70ad1f`.
- Local change: removes the upstream package's development-only metadata and
  an obsolete ESLint suppression; runtime behaviour is otherwise unchanged.

The patch literalises repeated extglobs containing unbounded glob stars and
branches with whole-string repetition overlap. This prevents the crafted
patterns described by the advisory from compiling into exponentially
backtracking regular expressions.

## Verification

`scripts/picomatch-security.test.mjs` pins the transformed regular expressions,
checks crafted inputs complete promptly, and confirms ordinary extglobs still
work. `scripts/verify-lockfile.mjs` requires the exact local package path and
version. CI continues to run `npm audit --audit-level=high`; the advisory is not
ignored or added to an allow-list.

Replace this directory with the first compatible official release that includes
an equivalent fix, then remove the local dependency and override.
