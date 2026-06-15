# HIVE-UI Build Plan

## Session 0: backend contract — complete

- Persistent streamed user and assistant messages.
- Conversation identity emitted before tokens arrive.
- Automatic bounded first-message title.
- Conversation rename and delete operations.
- Persistence and lifecycle tests.

## Session 1: frontend foundation — complete

- Vite + React + TypeScript + Tailwind.
- Cloudflare Pages Function authentication boundary.
- Typed API and SSE client.
- Routes: `/chat`, `/files`, `/skills`, `/ops`.
- Lighter HIVE navy/cyan/mint visual system.

## Session 2: chat — complete

- Conversation sidebar and mobile drawer.
- Streaming thread and stop generation.
- Shared composer, mode picker and model picker.
- Auto route default.
- Markdown/code rendering and cost metadata.
- Scroll-to-latest control.
- Collapsed inspector.

## Session 3: files — complete

- Multipart upload and drag-and-drop.
- Pasted-text upload.
- File listing and metadata inspection.
- Shared file-chat route.
- Workflow presets and source citations.

## Session 4: skills — complete

- Search, scores and repo/lane/risk filters.
- Task recommendation.
- Status badges and detailed inspection.
- Skill-to-chat hand-off.

## Session 5: ops — complete

- Health flags dashboard.
- Repository hygiene summaries and full report inspection.
- Workflow template selection.
- Interactive plan-only workflow graph display.
- Controlled execution-preview step statuses.
- Execution review queue table.
- Evidence-pack inspection.
- Approve, reject and needs-changes review decisions.

## Session 6: polish and deployment — next

- Production Cloudflare Pages deployment.
- Deployed API and CORS validation.
- Browser regression tests.
- Final mobile QA and telemetry refinement.
