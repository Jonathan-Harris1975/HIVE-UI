# HIVE-UI autonomous review — 5 July 2026

**Reviewed version:** v0.10.10
**Scope:** Full source tree (`src/`, `functions/`, `public/`, config) — every page, every component.
**Environment note:** This review was carried out by static code reading only. The sandbox this
review ran in has no network access, so `npm install`, `vite build`, ESLint, TypeScript, `npm run
check`, Lighthouse and Core Web Vitals could **not** be executed here. Everything below is a
source-level audit plus a set of hand-verified, targeted fixes. Before you ship this, run
`npm run check` and a Lighthouse pass yourself — see "What I could not verify" at the end.

---

## Headline finding

HIVE-UI is already in genuinely good shape. This isn't a fresh build — it's been through ~11
dated hardening patches (v0.9.2 → v0.10.9) plus a dedicated UX audit, and it shows:

- Route-level code splitting (`lazy()` + `Suspense`) for every page — Chat, Files, Skills, Ops.
- A real focus-trapped, ARIA-correct confirm dialog (`ConfirmDialog.tsx`) with Escape-to-cancel,
  Tab-cycling, focus restore, and body scroll lock.
- A fully keyboard-operable combobox for model selection (`ModelPicker.tsx`) — listbox/option
  roles, arrow-key navigation, `aria-activedescendant`, disabled-item skipping.
- Skip-to-content link, `:focus-visible` styling, `prefers-reduced-motion` handling, safe-area
  insets for notched devices, offline banner, loading skeletons and empty states with actions on
  every list view.
- A locked-down security posture (`_headers`): strict CSP, HSTS, COOP/CORP, `X-Robots-Tag:
  noindex`, no-store on HTML, long-cache immutable assets — appropriate for a private,
  single-operator console.
- No dead components, no leftover `console.log`/`TODO` markers, no duplicate components.

Because of that baseline, this pass found a handful of real, fixable gaps rather than systemic
problems. I fixed the ones that were safe to fix without a build step to verify against; I've
listed the rest as recommendations.

---

## Changes made

### 1. Mobile navigation drawer — accessibility gap (fixed)
**File:** `src/components/AppShell.tsx`

The hamburger-menu drawer (the `<aside>` shown below `lg`) had no focus trap, no Escape-to-close,
and didn't lock body scroll — unlike `ConfirmDialog`, which does all three. A keyboard or screen
reader user could Tab out of the open drawer into content hidden behind the scrim, and Escape did
nothing.

Fixed by adding a small `useMobileDrawer` hook (mirrors the pattern already proven in
`ConfirmDialog`) that:
- Moves focus into the drawer when it opens and restores it to the trigger button on close.
- Traps Tab/Shift+Tab inside the drawer.
- Closes on Escape.
- Locks `document.body` scroll while open.
- Adds `role="dialog"` / `aria-modal="true"` / `aria-label="Navigation"` to the drawer panel.

### 2. Conversation row actions invisible on touch (fixed)
**File:** `src/components/AppShell.tsx`

Rename/Delete on each sidebar conversation row were shown via `opacity-0` → `group-hover:opacity-100`
(plus `group-focus-within` for keyboard). Touch devices have no hover state, so on a phone these
controls were effectively undiscoverable — the only way to reach them was to already know they
existed and long-tab into them. Changed to visible-by-default below the `lg` breakpoint, fading in
on hover/focus only at `lg` and up where a hidden-until-hover affordance makes sense.

### 3. Decorative connector icon exposed to screen readers (fixed)
**File:** `src/components/WorkflowGraph.tsx`

The down-arrow connecting two workflow nodes had no `aria-hidden`, so screen readers would
announce a meaningless "arrow down" between every pair of nodes. Added `aria-hidden="true"` to the
wrapping `div`.

### 4. Dead font reference (fixed)
**File:** `src/index.css`

`--font-sans` declared `Inter` first, but no `@font-face`, no font file, and no `<link>` to a font
host exist anywhere in the repo — and the CSP (`connect-src 'self'`) would block a Google Fonts
request even if one were added. In practice every user has always been rendered in `ui-sans-serif`
already; the `Inter` token was inert. Removed it so the declared stack matches what actually
renders, and so nobody spends time "debugging" a missing web font that isn't wired up.

### 5. Link-preview metadata (added)
**File:** `index.html`

Added minimal `og:*` and `twitter:*` tags (title, description, site name, image) so that if you or
a teammate pastes the console URL into Slack/Teams, it renders a proper preview card instead of a
bare link. This does **not** change the app's search-engine posture: `robots` meta and the
`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` response header are untouched, so the app
still won't be indexed or crawled. I deliberately did not add JSON-LD/structured data or a sitemap
— those are for public, discoverable sites, and adding them to an authenticated, noindex operator
console would work against its own access-control intent.

---

## Reviewed and left unchanged (with reasoning)

- **Dark/light mode consistency** — HIVE-UI is dark-mode only by design (`color-scheme: dark`,
  no toggle, no light-theme tokens anywhere). There's no light mode to reconcile against. If you
  want a light mode in future, that's a design decision, not a bug fix, and I didn't invent one
  unasked.
- **SEO/sitemap/structured data** — intentionally absent; see point 5 above. This is correct for a
  private console and shouldn't be added wholesale just because "SEO" was on the checklist.
- **Bundle size / manual chunking** — Vite's default Rollup output plus the existing route-level
  `lazy()` calls already give you per-page chunks. I didn't add a `manualChunks` config because I
  have no way to measure the current chunk graph here (no `npm install`/build available) and
  guessing at chunk boundaries without data would be as likely to hurt as help. See recommendation
  below.
- **Colour palette** — hex values are repeated literally across pages rather than centralised as
  CSS custom properties/Tailwind theme tokens (e.g. `#0a192d`, `#071426` appear dozens of times).
  This isn't a visual inconsistency — the same handful of values are reused correctly everywhere —
  but it is technical debt: changing the palette today means a multi-file find/replace. I've left
  it as a recommendation rather than refactoring it blind, since touching every occurrence across
  a 2,000+ line file (`FilesPage.tsx`) without a build to verify against is a good way to introduce
  a regression.

---

## What I could not verify

No network access was available in this environment, which rules out anything requiring package
installation or a live browser:

- `npm run check` (lockfile check, source verification, security tests, `tsc`, ESLint, Vite build,
  dist verification) — **not run**. Please run this yourself before merging; it's exactly the gate
  your own CI (`ci.yml`) already enforces.
- Lighthouse / Core Web Vitals / real bundle-size numbers — **not measured**. The last recorded
  figure in your own docs was 198 KiB gzip JS at v0.7.0; that's a good sign but is now several
  releases old.
- Actual screen-reader testing (VoiceOver/NVDA/TalkBack) and real-device mobile testing — I
  reviewed ARIA roles, labels, and focus logic in source, but nothing replaces running it.
- `npm audit` — not run.

## Recommendations for next pass

1. Run `npm run check` and paste me the output — I can fix concrete TypeScript/ESLint errors much
   faster than I can guess at them.
2. Consider self-hosting one weight of a system-safe font (or just keep the system stack — it's
   free, it's fast, and it already matches your CSP without any extra request).
3. If `FilesPage.tsx` (2,190 lines) keeps growing, consider splitting it into a page shell plus
   feature components (upload, browser, lane picker) — not for correctness, purely to keep future
   diffs reviewable.
4. Centralise the repeated surface colours (`#061126`, `#071426`, `#0a192d`, `#0b1b31`,
   `#08172b`) as Tailwind v4 `@theme` tokens (e.g. `--color-surface-0/1/2/3`) next time you're
   touching those files anyway, so a future palette change is a one-line edit instead of a
   grep-and-replace.

---

## Files changed in this pass

- `src/components/AppShell.tsx` — mobile drawer focus trap/Escape/scroll-lock; always-visible
  touch actions on conversation rows.
- `src/components/WorkflowGraph.tsx` — `aria-hidden` on decorative connector.
- `src/index.css` — removed dead `Inter` font-stack entry.
- `index.html` — added OpenGraph/Twitter preview metadata.
