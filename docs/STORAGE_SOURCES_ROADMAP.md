> **Document status:** Production reference  
> **Last reviewed:** 16 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# Future HIVE multi-bucket file access

HIVE already exposes a credential-free R2 lane registry through `GET /v1/files/r2-lanes`. Session 6 surfaces that registry in the Files view without enabling broader object access.

## Current boundary

- `uploads` is the active read/write file lane.
- Other ecosystem buckets are metadata and public-URL aware only.
- HIVE-UI does not send Cloudflare R2 credentials to the browser.
- The interface does not offer selectors or buttons that imply unsupported access.

## Recommended staged implementation

### Stage 1: scoped read-only listing

Add a backend endpoint such as:

```text
GET /v1/files/sources/{lane}/list?prefix=...&limit=...
```

Requirements:

- Server-side allowlist of permitted lane names.
- Read-only credentials or narrowly scoped R2 tokens.
- Bounded prefixes, limits and response sizes.
- No arbitrary bucket names supplied by the browser.
- Provenance fields on every returned object.

### Stage 2: bounded read and file chat

Add lane-aware read and chat requests:

```text
GET  /v1/files/sources/{lane}/read?key=...
POST /v1/chat/with-source-file
```

Requirements:

- Size and content-type limits.
- Existing ZIP safety and text-extraction controls.
- Source lane, bucket and key recorded in citations and conversation metadata.
- Public URLs used only where explicitly configured.

### Stage 3: optional indexing

Allow approved objects to be chunked and indexed in HIVE SQL/Vectorize with a stable source identity:

```text
source_lane + bucket + object_key + content_hash
```

This prevents collisions between similarly named files in different buckets.

### Stage 4: tightly gated writes

Write access to non-upload buckets should be a separate capability, disabled by default and protected by:

- Lane-specific allowlists.
- Preview and approval gates.
- Idempotency keys.
- Audit records.
- No overwrite or delete operation without an explicit policy.

## Likely first read-only lanes

The safest first candidates are:

- `audits`
- `transcripts`
- `hive_skills`
- `meta`

Podcast audio, published pages and RSS artefacts should remain read-only unless a dedicated publishing workflow is intentionally designed.
