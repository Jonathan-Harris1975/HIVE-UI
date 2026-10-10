# HIVE-UI controlled live-test readiness evidence

Updated: 2026-10-10 UTC. Repository: Jonathan-Harris1975/HIVE-UI. This ledger is deliberately conservative: no live-provider or CI success is inferred from source inspection.

| Area | Requirement | Status | Implementation / evidence | Reproduce | Remaining dependency / owner |
| --- | --- | --- | --- | --- | --- |
| Autonomous detection | Failed workflow run is captured with job evidence | blocked | `.github/workflows/failure-diagnostics.yml`, `.github/scripts/failure_diagnostics.py` | Inspect completed failed workflow and retained artifact | Confirm recent workflow runs and incident persistence; repository maintainer |
| Self-repair | Trusted failure starts bounded repair PR | blocked | `.github/workflows/autonomous-repair.yml` | Controlled failed-main CI simulation, inspect PR and agent trigger | App permissions, webhook, idempotency and safe escalation evidence; maintainer |
| Production safeguards | Exact deployment SHA and gateway smoke test | blocked | `.github/workflows/deployed-integration.yml` | Dispatch with full expected SHA, inspect /health and Playwright results | Staging/current deployment run evidence and rollback rehearsal; deployment owner |
| Production safeguards | Artifact integrity and correct target | blocked | `scripts/verify-dist.mjs` | `npm ci && npm run build && npm run verify:dist` | Add manifest/digest, environment/API-target and CDN consistency verification; frontend owner |
| Ecosystem coordination | OIDC claims and cross-repository contract | blocked | `.github/workflows/oidc-readiness.yml` | Inspect OIDC run artifact and provider trust policy | Confirm external provider acceptance and seven peer contracts; ecosystem owner |
| Production safeguards | UI access controls and operator boundaries | blocked | Worker gateway and UI tests require complete inspection | `npm run check && npm run test:e2e` | Authorisation, CSRF/replay, browser and outage scenarios; security owner |

## Safe controlled live-test runbook

1. Record default-branch commit SHA, deployed Worker SHA, artifact digest, target environment, authorised operator, rollback artifact and incident channel.
2. Require successful exact-commit CI, security, OIDC/provider checks, deploy integration, API contract tests and a staging rollback rehearsal. Do not count skipped jobs as passes.
3. Run non-destructive tests for success, partial outage, stale R2 evidence, lease contention, unauthorised operator and mismatched deployment. Use mocks for privileged repair or production mutation.
4. Inject one controlled staging failure. Verify classification, deduplication, lock/lease, bounded retry, agent repair PR, required human approval and immutable evidence. Do not allow automatic merge or production deployment.
5. Abort on any unauthorised action, secret exposure, unexpected production mutation, wrong SHA, missing audit evidence, uncontrolled retries, or loss of rollback ability. Disable automation via the approved kill switch and restore the known-good release.
6. Record run URLs, observed results, timestamps, incident identifiers and approver in this ledger before advancing gates.

## Decision

**NOT READY**. This ledger is a starting evidence register, not proof that any listed external gate has passed. The current HEAD, branch rules, open PRs, recent workflow runs, and provider configuration still require full inspection and documented verification.
