> **Document status:** Historical implementation record  
> **Last reviewed:** 22 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# HIVE-UI Sessions 1 to 5

## Delivered UI surfaces

### `/chat`

- Persistent conversation list with search, rename and delete.
- Streaming response rendering with cancellation.
- Auto-route model selection followed by explicit models.
- Modes for general, brand, code, audit and file analysis.
- Shared file attachment flow.
- Workflow preset selection for file chat.
- Source citation, model, provider, token and cost inspection.

### `/files`

- Multi-file multipart upload.
- Drag-and-drop upload area.
- Text content upload through `/v1/files/upload-text`.
- File search, metadata cards and inspector detail.
- One-click hand-off to the shared `/chat` interface.

### `/skills`

- Registry search.
- Repository, lane and risk filters.
- Recommendation request through `POST /v1/skills/recommend`.
- Score, risk and status badges.
- Skill metadata inspection and chat hand-off.

### `/ops`

- HIVE health and configuration flags.
- Repository hygiene metrics and report drill-down.
- Workflow graph builder using `POST /v1/workflow-graphs/build`.
- Simple node-and-edge visualisation without a heavy graph dependency.
- Controlled execution preview using `POST /v1/execution-preview`.
- Step status and blocker display.
- Review queue using `/v1/execution-reviews`.
- Evidence-pack inspection and decision recording.

## Security boundary

The browser never receives the HIVE backend admin token. Cloudflare Pages Functions validate the separate UI access key and inject the backend bearer token server-side.

## Execution boundary

The Ops interface is review-gated. Approval decisions update review metadata and can surface an approved, allow-listed production handoff when the backend adapter policy is enabled.
