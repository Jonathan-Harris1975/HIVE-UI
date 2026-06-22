> **Document status:** Current cleanup review  
> **Last reviewed:** 22 June 2026  
> **UI marker:** `0.10.10` / `catalogue-metadata`

# HIVE-UI repository dust review

This review keeps current production documentation under `docs/` and removes superseded root-level patch notes, old update manifests and duplicate reports. The root now stays focused on source, config and current operator docs.

## Removed from the root

The following files were superseded by `README.md`, `docs/CHANGELOG.md`, `docs/PRODUCTION_READINESS.md`, `docs/OPERATIONS.md` and release notes under `docs/releases/`:

- `HIVE-UI-CI-FIX-MANIFEST.txt`
- `HIVE-UI-CI-FIX-REPORT.md`
- `HIVE-UI-PRODUCTION-READINESS-REPORT.md`
- `HIVE-UI-UX-AUDIT-2026-06-21.md`
- `HIVE-UI-v0.9.2-PRODUCTION-EXECUTION-GATES-PATCH.txt`
- `HIVE-UI-v0.10.0-R2-WRITE-SKILL-MODELS-PATCH.txt`
- `HIVE-UI-v0.10.1-MOBILE-CONTRAST-PASS-PATCH.txt`
- `HIVE-UI-v0.10.2-FILE-TO-SKILL-REVIEW-FLOW-PATCH.txt`
- `HIVE-UI-v0.10.3-FILE-SKILL-APPLY-FLOW-PATCH.txt`
- `HIVE-UI-v0.10.4-SKILL-CATALOGUE-CLEANUP-PATCH.txt`
- `HIVE-UI-v0.10.5-HELPER-ORCHESTRATION-PATCH.txt`
- `HIVE-UI-v0.10.6-STREAM-STATUS-PATCH.txt`
- `HIVE-UI-v0.10.7-VERSION-OPS-MOBILE-PATCH.txt`
- `HIVE-UI-v0.10.8-REVIEW-STATE-SYNC-PATCH.txt`
- `HIVE-UI-v0.10.9-CHAT-PERSISTENCE-SYNC-PATCH.txt`
- `V0.6.0_UPDATED_FILES_MANIFEST.txt`
- `V0.6.1_UPDATED_FILES_MANIFEST.txt`
- `V0.7.0_UPDATED_FILES_MANIFEST.txt`
- `V0.8.0_UPDATED_FILES_MANIFEST.txt`

## Generated artefacts removed locally before packaging

- `node_modules/`
- `dist/`

## Kept deliberately

- `docs/HIVE-UI-UX-AUDIT-2026-06-21.md`
- `docs/HIVE_UI_UX_AUDIT.md`
- `docs/releases/`
- `docs/PRODUCTION_READINESS.md`
- `docs/OPERATIONS.md`
- `README.md`
- `SECURITY.md`

Those files still serve as current or intentionally archived documentation.
