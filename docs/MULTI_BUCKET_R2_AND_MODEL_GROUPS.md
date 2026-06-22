> **Document status:** Production reference  
> **Last reviewed:** 22 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# Multi-bucket R2 and grouped model discovery

## R2 browser

HIVE-UI reads the lane registry from `GET /v1/files/r2-lanes`. Only lanes marked `readable` can be selected.

For each readable lane, the Files route supports:

- prefix/folder navigation;
- bounded filename search;
- cursor pagination;
- object metadata;
- extracted preview for supported text/document formats;
- authenticated download through the Cloudflare Pages proxy;
- shared-interface file chat for supported objects.

Every writable lane exposes multipart upload and paste-text controls. Non-writable lanes remain browse/view/download only until credentials allow writes.

The browser never receives R2 credentials. Calls go through the signed Cloudflare session, the Pages Function, and the authenticated HIVE backend.

## Model picker

The chat composer consumes the model metadata returned by `GET /v1/models` and groups visible models as:

1. HIVE configured
2. Free
3. Reasoning
4. Coding
5. Long context & documents
6. Vision / image analysis
7. Video analysis
8. General chat
9. Audio & speech
10. Image generation
11. Video generation
12. Other models

Auto route remains the first option.

A model with `chat_selectable=false` remains visible for discovery but cannot be chosen. In this release that includes image-generation, video-generation and unsupported output-only models. The picker displays the backend-provided reason rather than attempting an incompatible chat request.

## Backend environment contract

```text
R2_MULTI_BUCKET_READ_ENABLED=true
R2_READ_ACCESS_KEY_ID={{ secret.R2_READ_ACCESS_KEY_ID }}
R2_READ_SECRET_ACCESS_KEY={{ secret.R2_READ_SECRET_ACCESS_KEY }}
```

The existing upload credential remains separate and should stay scoped to the `hive` bucket.
