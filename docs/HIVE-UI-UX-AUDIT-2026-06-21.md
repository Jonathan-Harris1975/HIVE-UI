# HIVE-UI UX Audit - 21 June 2026

## Scope

Reviewed the supplied HIVE-UI source, interaction flows and production gate behaviour for `/chat`, `/files`, `/skills` and `/ops`. This audit is repository-based only; live browser telemetry and production user sessions were not externally verified in this environment.

## Executive view

HIVE-UI is already structurally strong for a private operations console: the four-route layout is clear, the left navigation keeps operator context stable, the inspector gives useful evidence depth without crowding the main surface, and the chat/file/skill workflow now feels coherent rather than bolted together.

The main UX risk was not cosmetic. The model picker displayed image and video generation models in the same chooser used for ordinary chat. The release contract says those models are discovery-only until a dedicated creation workspace exists, so the picker could invite an incompatible action. That has now been corrected in the patch.

## UX fixes included in this patch

### 1. Discovery-only model selection guard

Image and video generation models now remain visible in the picker for discovery, but cannot be selected for normal chat when the backend marks `chat_selectable=false`.

Impact:
- prevents accidental non-text model use in ordinary chat;
- aligns the UI with the current product contract;
- gives the operator an explicit `Discovery only` badge and backend-provided reason;
- avoids a confusing failed request after selection.

### 2. Mobile and icon-button accessibility labels

Added accessible names to the mobile navigation button, mobile close button, inspector toggle, inspector close button and icon-only route links.

Impact:
- improves screen-reader navigation;
- gives mobile icon-only controls a clear semantic label;
- reduces ambiguity for assistive tooling and browser accessibility trees.

### 3. Improved disabled-state explanation inside the picker

The disabled model message now uses a stronger amber text treatment, making it less likely to sink into the dark panel background.

Impact:
- makes model limitations easier to notice;
- keeps the discovery-only state visible without shouting at the operator.

## UX findings and improvement opportunities

### Priority 1 - Operator trust and irreversible-action clarity

The console has several safety-critical flows: execution reviews, cleanup actions, deleting conversations and using skills against files. Where the UI still relies on `window.confirm` or `window.prompt`, replace those browser-native interruptions with branded confirmation panels that show:
- action summary;
- affected object count;
- whether R2, D1, database rows or live systems will be touched;
- explicit safe/unsafe wording;
- final button copy that matches the consequence, such as `Delete D1 rows only`.

This is especially important for skill catalogue cleanup. The current wording is already sensible, but a dedicated confirmation panel would give much better operator confidence than a browser prompt.

### Priority 2 - Dense metadata is legible, but small

The visual palette is mostly sound on the dark HIVE background. The bigger issue is size rather than raw contrast: several badges and metadata lines use 9px to 10px text. That is fine for ornamental telemetry, but not ideal for operational clues such as model IDs, token/cost metadata, lane labels, source citations and status counts.

Recommended next pass:
- raise key metadata to at least 11px;
- keep 9px only for non-essential decorative chips;
- use compact labels, not microscopic labels.

### Priority 3 - Keyboard model-picker behaviour

The custom model picker has search, category filtering and listbox roles, but it would benefit from full keyboard list navigation:
- arrow up/down through results;
- Enter to choose;
- Escape to close and restore focus to the trigger;
- clear visual active-descendant state.

This matters because the model list can be long and power users will live in the keyboard.

### Priority 4 - Files page progressive disclosure

The Files page is carrying several jobs: lane browsing, upload, text upload, file chat, skill application and skill creation. The current layout works, but it is cognitively busy.

Recommended next pass:
- keep lane browsing as the primary task;
- expose upload/chat/skill actions only after a file or writable lane is selected;
- show a small decision strip: `Browse`, `Upload`, `Use with skill`, `Create skill`;
- keep `Create skill from file` visible only inside the governed HIVE skills descriptor folder, as already required.

### Priority 5 - Empty/error states should offer the next action

The empty states are readable, but some could do more work. When no skills, files or conversations are found, add the most likely next action directly beside the message, for example:
- clear filters;
- refresh lane;
- upload a file;
- open skills folder;
- start a new conversation.

### Priority 6 - Status language should separate liveness, readiness and degraded state

The Ops dashboard already exposes rich health information, but the UI summary copy should consistently separate:
- process online;
- configured and ready;
- degraded but usable;
- blocked.

This mirrors the backend readiness contract and prevents false-green theatre, the dashboard equivalent of putting a lab coat on a parrot.

### Priority 7 - Mobile header compression

On small screens the header has title, menu, optional status and inspector toggle. This is usable, but if more controls are added, use a compact `More` actions sheet rather than squeezing additional buttons into the header.

## Contrast notes

No source-level colour token appeared catastrophically low against the main dark backgrounds. The practical issue is the combination of small text, opacity-heavy utility classes and dense metadata. Avoid lowering opacity further on `text-slate-400`, `text-amber-100`, `text-emerald-100` and `text-cyan-200` when the copy is operational rather than decorative.

## Validation

- `npm run check` passed after the UI patch.
- HIVE backend model grouping tests were updated and the full HIVE backend test suite passed.
- Live production interaction was not externally verified from this environment.
