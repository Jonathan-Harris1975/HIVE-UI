# HIVE-UI UI/UX audit and overhaul

## Stack and existing approach

- React 19 + TypeScript + Vite 8.
- Tailwind CSS 4 with `@theme` tokens in `src/index.css`.
- Lucide React icon set, React Router and an in-house component layer (`AppShell`, `ConfirmDialog`, `EmptyState`, `ModelPicker`, etc.).
- Existing responsive Tailwind layouts, mobile navigation drawer, keyboard focus trapping and reduced-motion support.

## Issues found

- Dense typography had drifted: `text-xs` was used hundreds of times as ordinary copy rather than metadata.
- Core dark palette values were repeated throughout TSX instead of consistently using the existing HIVE theme tokens.
- Several 28–32px controls felt cramped, especially in chat/model workflows.
- One operational health card used `div role="button"` instead of a native button.
- Some search/select/icon interactions relied on placeholders or visual context rather than explicit accessible names.
- Loading/error states were visible but not consistently announced to assistive technology.
- `100vh` usage on authentication/error/shell surfaces was less reliable on mobile browser chrome than dynamic viewport units.

## Changes implemented

- Expanded the existing Tailwind HIVE palette and migrated the core repeated dark utilities to semantic theme tokens.
- Raised the global `text-xs` presentation to a 13px baseline while retaining explicit leading utilities and compact metadata intent.
- Strengthened low-contrast `text-slate-500` metadata and compact desktop control sizing.
- Preserved and extended 44px coarse-pointer touch targets and reduced-motion behaviour.
- Switched shell/auth/error surfaces to dynamic viewport sizing.
- Added/strengthened accessible labels, live loading/error announcements and dialog busy/error semantics.
- Replaced the faux operational button with native button semantics.
- Improved chat starter readability, attachment removal naming, chat/workflow select naming and model-picker sizing.
- Added UI contract tests covering token use, interaction semantics and responsive/accessibility baselines.
