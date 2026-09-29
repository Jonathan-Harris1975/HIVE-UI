# HIVE-UI snapshot notes

## Repository automation overview tidy-up

Repository administration is now intentionally read-only in HIVE-UI. The governed repository estate is fully automated through scheduled refresh, repository CI/security gates, CodeQL-to-Kilo repair, deployment verification and Council evidence generation.

The UI therefore has one repository surface:

- **Repositories**: snapshot, Memory, Intelligence, automation and service-health overview only.
- Legacy `/memory` and `/intelligence` routes redirect to `/repositories` and preserve the query string.
- Manual upload, bulk refresh, reindex, setup repair, Memory editing, manual Intelligence runs, improvement runs and repository deletion controls are removed from HIVE-UI.

Operations has also been separated from repository status:

- repository-health cards are no longer rendered on Operations;
- repository-manager counts are no longer requested or displayed on Operations;
- Operations remains responsible for HIVE runtime state, integration readiness, operational events, reviews, model/provider runtime data, workflow planning and the explicitly confirmed database reset.

## Files removed

- `RepositoriesPage.tsx` (stale repository-root copy)
- `RepositoryIntelligencePage.tsx` (stale repository-root copy)
- `src/components/RepositoryOperationsPanel.tsx`
- `src/pages/RepositoryIntelligencePage.tsx`
- `src/pages/RepositoryMemoryPage.tsx`

## Validation completed

- `node --test scripts/ux-contract.test.mjs scripts/ui-overhaul.test.mjs`: 16/16 passed.
- `npm run verify:lock`: passed.
- `npm run verify:source`: passed.
- `python3 scripts/secret_scan.py`: passed.
- TypeScript source line-length contract: passed.

A complete dependency-backed typecheck/build was not run in this workspace because dependencies are not installed and the local Node runtime is v22.16.0 while the repository pins Node 24.21.0. CI remains the authoritative build gate.
