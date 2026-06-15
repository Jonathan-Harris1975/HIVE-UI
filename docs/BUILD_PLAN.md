# HIVE-UI Build Plan

## Session 0: backend contract

- Persist streamed user and assistant messages.
- Return conversation identity before tokens arrive.
- Generate a bounded title from the first user message.
- Add rename and delete operations.
- Cover persistence, titles and lifecycle operations with tests.

## Session 1: frontend foundation

- Vite + React + TypeScript + Tailwind.
- Cloudflare Pages Function authentication boundary.
- Typed API and SSE client.
- Routes: `/chat`, `/files`, `/skills`, `/ops`.
- Lighter HIVE navy/cyan/mint visual system.

## Session 2: chat

- Conversation sidebar and mobile drawer.
- Streaming thread and stop generation.
- Shared composer, mode picker and model picker.
- Auto route as the default.
- Markdown/code rendering and cost metadata.
- Collapsed inspector.

## Session 3: files

- Upload and listing.
- Metadata inspection.
- Shared file-chat route.
- Workflow presets and source citations.

## Session 4: skills

- Search, scores and filters.
- Task recommendation.
- Skill detail inspection.

## Session 5: ops

- Health flags.
- Repository hygiene report.
- Workflow template data.
- Review queue data.
- Later: interactive graph, decision controls and evidence packs.

## Session 6: polish and deployment

- Responsive and empty/error states.
- Production Cloudflare Pages deployment.
- Deployed API/CORS validation.
- Browser regression tests.
- Cost and token presentation refinement.
