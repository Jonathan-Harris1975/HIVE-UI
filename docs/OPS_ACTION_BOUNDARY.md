# HIVE-UI privileged operations boundary

HIVE-UI sessions authenticate access to the console, but they do not identify an individual operator or authorise approval, repair, deployment, or destructive data actions. The Worker holds a HIVE admin token for its server-to-server proxy; that token must not turn a browser session into a privileged HIVE actor.

The Worker therefore rejects lifecycle `accept-fix`, database `purge-reset`, approval/repair/deployment routes, execution decisions, operational-alert deletion, R2 object deletion, conversation deletion, and model-registry mutations before forwarding them to HIVE. Read-only alert and review requests remain available. These denials apply even to a valid HIVE-UI session and are logged with a request ID, without request bodies or credentials.

The Ops screen treats failed or malformed reads as unknown, clears a prior snapshot after a failed refresh, marks operational and actionable snapshots unknown after two minutes without a successful read, serialises any review submission in the browser, and requires a current approval record bound to the full 40-character source SHA and proposal revision before attempting an action. This is a display and accidental-repeat safeguard; HIVE must independently enforce authorisation and approval validity.

## HIVE owner prerequisites

Before enabling any approval or repair action from HIVE-UI, the HIVE service owner must provide and verify all of the following in a non-production environment:

- An individual authenticated operator identity. The shared `HIVE_UI_ACCESS_KEY` is not an actor identity and must not be used as approval evidence.
- A server-side authorisation policy for the exact action, repository, pull request, full head SHA and proposal revision. The UI submits expected repository/SHA/proposal-revision values and the backend must re-read the current proposal and reject changed or stale revisions.
- A signed or otherwise authoritative approval record containing the authenticated actor, full head SHA, proposal revision, and expiry. Missing, expired, revoked, or mismatched evidence must fail closed.
- An idempotency key recorded server-side with the exact repository, SHA, actor, request ID and final result. Repeated submissions must return the original result without dispatching a second repair.
- A repair-provider result contract that distinguishes accepted, rejected, timed out/unknown, and completed. A provider `403` must remain a rejection with safe guidance; it must not be reported as accepted.
- Independent post-repair validation and reconciliation. “Accepted” means only that the provider accepted a handoff; it does not mean the repair or deployment succeeded.

Until those controls exist and are tested, leave the UI route blocked in `workers/gateway/proxy-policy.ts`. Do not solve a provider `403` by broadening the HIVE admin token or exposing a provider credential to the browser.

## Cloudflare owner verification

Verify the Production Worker has the existing required `HIVE_UI_SESSION_SECRET`, `HIVE_UI_ACCESS_KEY`, and `HIVE_ADMIN_TOKEN` secrets, the expected HIVE API origin, and the `LOGIN_RATE_LIMITER` Durable Object binding/migration. Keep the HIVE admin token server-side and least-privileged for the proxy’s approved read and routine UI API needs. Confirm Worker logs retain request IDs for denied actions and upstream failures while excluding tokens and action payloads.

The repository’s Kilo workflows also consume the GitHub Actions secret `KILO_REPAIR_TRIGGER_URL`. The repository owner must check that this secret points to the intended Kilo webhook and that the Kilo-side identity/policy permits this repository and workflow. The historical Kilo HTTP 403 is not corrected by these UI changes. Validate the configured endpoint through the existing redacted validator and a controlled non-production handoff; never print or copy the secret into logs, issues, or this repository. The Cloudflare account owner must also verify user MFA and account-level two-factor enforcement; repository code cannot enable either setting.

GitHub OIDC claim validation in `.github/workflows/oidc-readiness.yml` proves the GitHub token claims only; it does not prove an external provider trusts them. Where a Cloudflare or other service integration supports GitHub OIDC, the platform owner must configure the trust policy for the GitHub Actions issuer, the intended audience, this exact repository identity, the intended workflow, and `refs/heads/main` or a named protected environment. Do not accept wildcard repository, branch, workflow, or audience subjects. Record the provider-side acceptance evidence for every repository in the ecosystem; this repository’s self-check is not proof of the other repositories’ trust.

## Live verification after owner configuration

Use a non-production HIVE instance and record the tested HIVE-UI commit SHA, HIVE backend revision, request ID, repository, PR head SHA, actor, approval revision, provider response, and post-change health result.

1. Confirm an unauthenticated request and a normal signed HIVE-UI session both receive a Worker `403` for the blocked action routes, and confirm HIVE receives no such request.
2. Confirm stale/changed proposals, expired approvals, missing actor identity, HIVE outage, malformed or partial review responses, and provider `403` all leave the action blocked and status unknown/error.
3. After the backend introduces the verified individual-operator contract, test one authorised non-production action, repeat its idempotency key, and verify exactly one repair handoff with the same correlated result.
4. Change the PR head or proposal revision and let an approval expire; verify both submissions are denied server-side.
5. Verify independent checks, deployment eligibility, post-change service health, alert delivery, and reconciliation against the same exact source revision.
6. Verify the external OIDC provider rejects the wrong repository, workflow, branch/environment and audience, and accepts only the intended identity. Do not treat GitHub claim verification or a successful Worker deployment as provider trust evidence.
