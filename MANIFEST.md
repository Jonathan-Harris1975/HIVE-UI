# HIVE-UI changes — this session

## New files (7)
- src/pages/RepositoriesPage.tsx
- src/pages/RepositoryIntelligencePage.tsx
- src/pages/IntegrationsPage.tsx
- src/pages/CouncilPage.tsx
- src/pages/ExecutionReviewsPage.tsx
- src/pages/ExecutionSimulationPage.tsx
- src/pages/OptimisationPage.tsx

## Edited files (3)
- src/types/api.ts        (added ~25 new interfaces for the routers above)
- src/App.tsx             (7 new lazy routes)
- src/components/AppShell.tsx  (7 new nav items + page titles/subtitles)

## Not verified
No npm install / tsc / eslint / vite build was run against this code — the
sandbox this was built in has no network access. Run the following before
merging:

    npm install
    npm run build
    npm run lint   # or your project's equivalent

## Backend routes this wires up
/v1/repositories/*, /v1/repositories/{id}/qa, /v1/repositories/{id}/council*,
/v1/repositories/{id}/learning/*, /v1/connectors, /v1/buckets,
/v1/ai-council/*, /v1/benchmark/*, /v1/execution-reviews/*,
/v1/execution-preview/*, /v1/workflow-simulation,
/v1/workflow-graphs/templates, /v1/optimisation/*, /v1/environment/audit
