# HIVE-UI controlled live-test readiness evidence

Updated: 2026-10-10 UTC. Repository: Jonathan-Harris1975/HIVE-UI. This ledger is deliberately conservative: no live-provider or CI success is inferred from source inspection.

| Area | Requirement | Status | Implementation / evidence | Reproduce | Remaining dependency / owner |
| --- | --- | --- | --- | --- | --- |
| Autonomous detection | Failed workflow run is captured with job evidence | blocked | `.github/workflows/failure-diagnostics.yml`, `.github/scripts/failure_diagnostics.py` | Inspect completed failed workflow and retained artifact | Confirm recent workflow runs and incident persistence; repository maintainer |
| Self-repair | Trusted failure starts bounded repair PR | blocked | `.github/workflows/autonomous-repair.yml` | Controlled failed-main CI simulation, inspect PR and agent trigger | App permissions, webhook, idempotency and safe escalation evidence; maintainer |
| Production safeguards | Exact deployment SHA and gateway smoke test | blocked | `.github/workflows/deployed-integration.yml` | Dispatch with full expected SHA, inspect /health and Playwright results | Staging/current deployment run evidence and rollback rehearsal; deployment owner |
| Production safeguards | Artifact integrity and correct target | blocked | `scripts/verify-dist.mjs` | `npm ci && npm run build && npm run verify:dist` | JS entry-point and referenced-asset existence now checked in scripts/verify-dist.mjs (commit c46b39e); manifest/digest, environment/API-target and CDN consistency still unverified; frontend owner |
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

## 2026-10-10 implementation update

- PR #129 branch contains a stronger `scripts/verify-dist.mjs`: rejects HTML without a JS entry and rejects missing referenced `/assets/` files. This code change has **not** yet been validated by an actual build/test run.
- GitHub open-PR search returned PR #129 only at inspection time. No unrelated PR was modified.
- Base commit `6533342999275a715fe47d251b42ed1864c958cf` returned a successful `codecov/patch` status only; this is not evidence that all required checks passed.
- CI run history, current deployment SHA, provider OIDC acceptance, environment secrets, branch protections and rollback rehearsal remain unverified. Release verdict remains NOT READY.

## 2026-10-10 follow-up

- Commit `5650c350460878a10e5d08cfd75ff0f594677137` adds `scripts/verify-dist.test.mjs` with positive and negative artifact verification scenarios.
- Commit `f5249706c6f70e8a5b07be30fc453bde14ff5371` adds `npm run test:dist` and includes it in `npm run check`.
- GitHub reports PR #129 as open and mergeable. Combined commit status query returned zero statuses for `f5249706c6f70e8a5b07be30fc453bde14ff5371`; no passing CI conclusion has been established.
- Local checkout could not connect to github.com due to DNS resolution failure. No local npm checks or browser smoke tests have been run.
- Required next gate: run CI/security and staging tests for the PR head SHA; inspect GitHub Actions conclusions, external provider trust, and rollback rehearsal. **NOT READY** until evidenced.
