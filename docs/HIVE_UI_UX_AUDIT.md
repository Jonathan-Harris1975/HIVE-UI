# HIVE-UI UX Audit

## Scope

Focused review of the file explorer, file-chat hand-off, model/workflow controls and mobile chat ergonomics after the production R2 workflow changes.

## Implemented improvements

- Added a persistent multi-select basket for R2 objects so operators can select several files across different lanes/buckets before sending them into one chat session.
- Added bulk chat hand-off from the file explorer to the shared chat UI using a `sources` payload, while preserving the legacy single-file URL contract.
- Added lane-scoped delete actions for writable R2 objects, including single-object delete and grouped bulk deletion across writable lanes.
- Added clearer selected-object feedback with count, lane count, selected state, and action buttons.
- Updated chat attachment chips so multi-file chats show the number of selected files and lanes instead of pretending there is only one attached file.
- Kept file chat in the shared chat interface instead of introducing a separate file-chat screen.

## Remaining UX improvement opportunities

- Add an undo-style grace period for R2 deletion if the backend later supports soft-delete, object versioning, or a governed trash prefix.
- Add a compact selected-file drawer on mobile so users can inspect the full selected list before chatting or deleting.
- Add content-type warnings before chatting with binary-heavy objects, especially large ZIPs, images and audio.
- Add keyboard shortcuts for select all visible, clear selection, and send selected files to chat.
- Add per-lane filter chips in the selected-object basket when many buckets are involved.
- Add clearer empty states for lanes that are configured but not readable or writable.

## UX verdict

The file workflow now matches the operator mental model better: browse buckets, select evidence, bring several artefacts into one analysis, and remove unwanted bucket objects without leaving HIVE-UI.
