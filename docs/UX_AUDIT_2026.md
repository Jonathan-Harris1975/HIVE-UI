# HIVE-UI UX/UI audit — 2026

## Method and baseline

`npm ci` completed and `npm run test:ux-contract` passed **21/21** before presentation changes. The local application reaches the private access screen, but authenticated routes cannot be completed without an operator access key. Route-level review therefore used source inspection rather than pretending an authenticated screenshot was evidence. The login surface was reviewed at the requested responsive breakpoints; authenticated before/after capture is listed as a follow-up requiring a valid local session.

The three repository-root page copies are **stale**: `OpsPage.tsx`, `RepositoriesPage.tsx`, and `RepositoryIntelligencePage.tsx` differ from their live `src/pages/` counterparts. They were not edited, as required.

## Cross-product findings

### Blocking

- **No blocking presentation defect found that prevents the console from being operated from source review.** Behavioural defects were outside this presentation-only scope.

### Major

- **Hierarchy was duplicated.** AppShell supplied the page title/subtitle while most pages supplied a second eyebrow plus h1/h2. This diluted orientation and created inconsistent heading levels. The redesign makes the shell the single page-heading surface and removes duplicate page titles where present.
- **Border/radius overload.** Most pages used `rounded-3xl` containers, nested `rounded-xl` cards and borders at every level. The new foundation uses tonal canvas/surface/raised layers, two radii and one restrained elevation rule. Existing page markup is visually normalised while it is progressively migrated to primitives.
- **Accent had become semantic noise.** Cyan represented navigation, buttons, focus, headings and status-like decoration. The foundation reserves a single teal accent for primary/active UI while emerald/amber/rose remain semantic status colours.
- **Typography depended on global hacks.** `.text-xs` and `.text-slate-500` globally overrode Tailwind utilities to compensate for undersized copy. Those hacks are removed; a five-step HIVE type scale now exists in `@theme`.
- **Navigation was over-classified.** Three labels divided only seven destinations. Desktop navigation is flattened and can collapse to an icon rail. Active treatment is quieter. Mobile retains the drawer because it exposes all seven destinations and the chat conversation affordances without hiding operational areas behind an arbitrary five-item tab bar.
- **Oversized pages expose too much at once.** Files, Repository Intelligence and Operations remain structurally large. The redesign strengthens existing disclosures and tonal grouping without moving logic. Further extraction is recommended below because changing information architecture and state ownership together would violate this presentation-only pass.

### Minor

- Repeated uppercase/wide-tracked eyebrow labels made metadata compete with content. Primary page eyebrows are removed; remaining labels are reserved for genuinely compact metadata.
- Inspector styling previously looked equal in weight to the main workspace. It is now treated as a secondary raised surface with quieter separators.
- Conversation navigation was visually card-heavy. The shell now uses flatter rows; a date-grouping extraction remains recommended because conversation timestamps are not consistently exposed in the current shell model.

## Page review

| Page | Severity | Findings and redesign direction |
| --- | --- | --- |
| Login | Major | Two explanatory paragraphs and multiple accents delayed the only task. Reduced to one surface, one short descriptor and one accent action; authentication behaviour is unchanged. |
| Chat | Major | Empty state carried decorative eyebrow copy and the composer competes with multiple controls. Keep composer dominant, keep message measure constrained, and progressively collapse secondary controls without changing model/preset state. |
| Files | Major | ~1,500 lines, nested cards, storage explanation before file work, and selection actions distributed through the page. Default should read as a file list/table with sticky selection actions and chip-like lane filtering. Existing destructive confirmation remains unchanged. |
| Repositories | Major | Overview mixed estate status, automation, upload and deep snapshot detail. Shell title is now authoritative; status and recovery should stay above details, with deep metadata in disclosure. |
| Memory & Intelligence | Major | ~1,450 lines and many simultaneous panels. Repository selector is the key context control; improvement settings/history should remain progressively disclosed. “Carry out improvements” behaviour and copy are preserved. |
| Models | Major | Registry is dense enough to benefit from table-first scanning and progressive detail. Accent should identify current/primary actions, not every model fact. |
| AI Council | Major | Intro repeated shell hierarchy and warning competed with the run action. Duplicate title removed; benchmark provenance remains visible because it affects interpretation. |
| Optimisation | Minor | Ledger/history is naturally chronological; flatter timeline/list treatment is preferable to nested cards. Duplicate title removed. |
| Execution Plan | Major | The process needs a dominant current step. Existing Preview → Review → Approve → Execute sequence is retained and should be styled as a stepper rather than four equivalent cards. |
| Reviews | Major | Approval is the critical decision. Manual-plan creation is secondary; evidence/history should not compete with approval controls. Duplicate title removed. |
| Operations | Major | Status, reviews, repositories, models, providers and execution tooling appear in one long surface. Keep readiness first, collapse service detail, retain the typed `PURGE ALL DATABASES` danger zone at the bottom. |
| Integrations | Minor | Status should precede connector metadata. Duplicate page heading removed; service detail remains progressively disclosed. |
| Monthly Review | Minor | Governance summary is small but repeated the shell heading. Duplicate heading removed and summary remains the first content. |
| Communications | Minor | Embedded console already has a narrow responsibility. Keep frame quiet and reserve stronger colour for loading/error status only. |

## Responsive and accessibility review

The shell retains the skip link, focus-visible treatment, dialog/listbox semantics, aria-live regions, reduced-motion handling and coarse-pointer 44px targets. The mobile drawer remains preferable to a bottom bar for this seven-destination private console because a bottom bar would either overflow, hide destinations behind “More”, or split navigation models. Safe-area handling remains in place. Content wrappers retain `min-w-0`/overflow protections; 320px horizontal overflow is checked in the verification commands where authenticated rendering is feasible.

## Test assertion changes

- `scripts/ui-overhaul.test.mjs`: replaced the assertion requiring the global `.text-xs { font-size: 0.8125rem; }` override with assertions for the new `--text-hive-xs` token and the **absence** of a global `.text-xs` font-size override. Reason: the old assertion enforced the exact typography hack this redesign was explicitly required to remove while preserving the test’s intent that dense copy has a deliberate readable baseline.

No test was deleted.

## Recommendations not implemented

1. Extract Files selection toolbar, lane filter and mobile selection drawer into presentational components once authenticated visual regression fixtures exist.
2. Split Repository Intelligence into overview, improvements, evidence and history presentational sections while leaving data/state ownership in the page.
3. Split Operations service status and danger-zone presentation into dedicated components.
4. Add authenticated Playwright visual fixtures for 375, 768 and 1280 px so future presentation work can be diffed rather than source-reviewed.
5. Add conversation date grouping when the conversation model exposes a reliable display timestamp in this UI layer.
