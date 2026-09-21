# HIVE-UI redesign report — 2026

## Delivered

- Added a dark-first design foundation in `src/index.css`: canvas/surface/raised tones, one accent, semantic status colours, five-step type scale, 4px rhythm, two radii and one elevation rule.
- Added presentational primitives in `src/components/ui/index.tsx`: `PageHeader`, `Section`, `Card`, `Stat`, `KeyValueList`, `Tabs`, `Button`, `Toolbar`, `Skeleton`. Existing `StatusBadge` and `EmptyState` remain intact.
- Removed the global `.text-xs` and `.text-slate-500` compensation hacks.
- Flattened desktop navigation from three labelled groups to seven direct destinations and added a collapsible icon rail. Mobile retains the accessible drawer because seven destinations plus chat history do not fit a useful bottom bar without a “More” escape hatch.
- Quietened active navigation and section-tab treatment, retained the inspector as a clearly secondary surface, and preserved skip-link/focus/reduced-motion/coarse-pointer behaviour.
- Simplified Login to one surface, one short descriptor and one accent action without touching auth/session behaviour.
- Removed duplicate in-page headings on Council, Execution Plan, Execution Reviews, Integrations, Models, Optimisation, Repositories, Repository Intelligence and Monthly Review. AppShell remains the authoritative h1/page description.
- Applied flatter tonal separation across existing page markup so large pages improve immediately without moving state/API logic.
- Root `OpsPage.tsx`, `RepositoriesPage.tsx` and `RepositoryIntelligencePage.tsx` were confirmed different from live `src/pages` files and were deliberately left untouched.

## Page outcomes

Chat keeps its behaviour and accessibility contracts while inheriting calmer surfaces and accent rules. Files keeps all R2 behaviour and destructive confirmations while its nested surfaces are visually flattened. Repositories and Memory & Intelligence now rely on the shell for page identity and retain recovery/workflow controls. Models, Council and Optimisation use quieter hierarchy. Execution retains its Preview → Review → Approve → Execute semantics. Operations retains the typed `PURGE ALL DATABASES` friction and existing ConfirmDialog flows. Integrations, Monthly Review and Communications inherit the same tonal/status rules.

## Test-contract edits

1. `scripts/ui-overhaul.test.mjs` no longer requires `.text-xs { font-size: 0.8125rem; }`. It now requires the `--text-hive-xs` token and asserts that a global `.text-xs` font-size override is absent. This preserves the readable-type intent while allowing the requested removal of the hack.
2. The execution-planning assertion now checks the preserved `['Preview', 'Review', 'Approve', 'Execute']` step sequence instead of the removed duplicate heading “Preview a controlled execution plan”. The behavioural intent remains intact.

No tests were deleted.

## Verification

- Baseline `npm run test:ux-contract`: **21/21 passed** before changes.
- Final `npm run test:ux-contract`: **21/21 passed**.
- `npm run secret:scan`: **passed**.
- `npm run check`: progressed through lock verification, source verification, security tests (**10/10**) and UX contract tests (**21/21**), then stopped at TypeScript because the sandbox `npm ci` did not finish installing `vite/client` and `@types/node` before the execution timeout.
- `npm run check:bundle-budget`: could not run because `dist/` was not produced after the incomplete dependency install prevented build.
- `npm run test:e2e`: not run for the same incomplete Playwright/Vite install, and authenticated routes also require a valid operator session.
- Screenshot matrix: authenticated 375/768/1280 captures could not be truthfully produced without a local operator login. The audit therefore records source review rather than fabricated screenshots.

## Recommendations not implemented

- Add an authenticated visual-regression fixture specifically for the three requested viewport widths.
- Extract Files selection/lane presentation, Repository Intelligence sections and Operations service detail into smaller presentational components in a follow-up. Their state/API ownership should remain in the current pages.
- Add date grouping to chat history once the shell has a reliable display timestamp for every conversation.
