# HIVE-UI snapshot notes

## Execution and optimisation tidy-up

The former three-tab Optimisation workspace has been split by responsibility:

- **Execution → Plan**: deterministic planning estimate and saved preview flow.
- **Execution → Reviews**: review, approval, audit trail and evidence-pack workflow.
- **Optimisation**: recorded decision and experiment history only.

`/execution-simulation` remains as a compatibility redirect to `/execution`.

The Execution Plan flow now persists a preview before creating a review plan and
passes the persisted preview/simulation provenance into the review record. The
review page also unwraps stored D1 metadata correctly when opening a plan.

Optimisation no longer labels a ledger status change as an external rollback.
The UI uses **Mark reverted** and the backend exposes `/revert`; the legacy
`/rollback` endpoint remains as a backwards-compatible alias.

## Files changed in this tidy-up

- scripts/ui-overhaul.test.mjs
- src/App.tsx
- src/components/AppShell.tsx
- src/pages/ExecutionPlanPage.tsx (replaces ExecutionSimulationPage.tsx)
- src/pages/ExecutionReviewsPage.tsx
- src/pages/OpsPage.tsx
- src/pages/OptimisationPage.tsx
- src/types/api.ts

## Validation completed

- HIVE-UI source/UX contract tests: 17 passed in this historical tidy-up snapshot; this is not the current release-gate count.
- HIVE-UI source verification: passed.
- Backend test suite in the paired HIVE repository: 433 passed.

The full UI dependency install/typecheck/build was not run in this workspace
because its Node runtime is v22.16.0 while this repository requires Node
>=22.22.0. CI or local validation should use the engine declared in package.json.
