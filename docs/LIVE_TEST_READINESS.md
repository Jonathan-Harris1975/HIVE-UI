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

## 2026-10-10 completed PR-head CI evidence

- GitHub Actions for commit `4d8f88568d99ab09e4aad3180f9d7839b3573767` returned **success** for Security and repository quality (`38013646165`), autofix.ci (`38013646171`), Item 6 hardening (`38013646229`), CodeQL (`38013646253`), and HIVE-UI CI (`38013646268`).
- HIVE-UI CI jobs `verify`, `Playwright end-to-end`, `Release gate (exact SHA)` and `ci-gate` all returned **success**. Central operations failure notification was skipped on this successful run.
- **Evidence boundary:** these runs apply to the referenced commit; the ledger itself has since changed the PR head. Require checks for the final merged SHA or current PR head. Staging deployment, real provider OIDC acceptance, rollback and recovery rehearsal remain unverified.
- PR #129 remains open and reported mergeable at inspection. **Controlled live-test readiness: NOT READY** pending environment-specific proof and final-head checks.

## Current-head verification, 2026-10-10 follow-up

Baseline: `350ee077fa374a55b0a0afd4261731b990ca0403` on `Jonathan-Harris1975/HIVE-UI/main`. PR #129 merged; no open PRs were returned before this follow-up. Existing production target is `https://hive.jonathan-harris.online`; no staging environment or rollback execution has been verified. GitHub environment enumeration is unavailable through the connected API.

| Area | Requirement | Status | Evidence / observed result | Remaining dependency and owner |
| --- | --- | --- | --- | --- |
| Autonomous detection | Capture failed runs | verified | [Diagnostics run](https://github.com/Jonathan-Harris1975/HIVE-UI/actions/runs/38019754883) succeeded; workflow retains a 30-day diagnostic artifact | Durable incident and external notification delivery remain separate unverified gates; operations owner |
| Self-repair | Provider accepts repair request | blocked | [Repair run](https://github.com/Jonathan-Harris1975/HIVE-UI/actions/runs/38019656829) logs explicitly report Kilo HTTP 403 | Repair provider owner must correct webhook authorisation and demonstrate one accepted, bounded staging repair; later no-op successes do not prove delivery |
| Production safeguards | Current-main CI/security and deployed gateway | verified | [CI](https://github.com/Jonathan-Harris1975/HIVE-UI/actions/runs/38025796178), [Security](https://github.com/Jonathan-Harris1975/HIVE-UI/actions/runs/38025796177), [CodeQL](https://github.com/Jonathan-Harris1975/HIVE-UI/actions/runs/38025796204), [deployed integration](https://github.com/Jonathan-Harris1975/HIVE-UI/actions/runs/38025934860) succeeded for the baseline above | Applies only to that SHA; new changes require their own checks |
| Production safeguards | Nested artifact validation | verified | `scripts/verify-dist.mjs:34-60`; `node --test scripts/verify-dist.test.mjs`: 12 passed. Recursive source-map and secret-name checks cover nested modules; tests cover missing CSS, case mismatch, query strings and multiple entries | CI must confirm this follow-up commit |
| Production safeguards | Staging rollback, artifact digests and browser privilege boundary | blocked | Current configuration has production custom domain and `preview_urls = false`; gateway accepts the broad `v1/` namespace with a server admin token | Deployment owner must supply an isolated rehearsal environment and known-good artifact. Security owner must verify backend authorisation and repair/deploy route restrictions before live injection |
| Ecosystem coordination | OIDC claims | verified | [OIDC run](https://github.com/Jonathan-Harris1975/HIVE-UI/actions/runs/38025796185) succeeded | Token claim inspection is not external provider acceptance |
| Ecosystem coordination | Eight-repository contracts and provider trust | blocked | No witnessed cross-repository contract or provider trust acceptance evidence collected | Ecosystem/provider owners must supply exact audience, subject, permissions and contract evidence |

Local checks before session reset passed: `npm run check` (37 unit tests plus security/UX/artifact checks), 66 Python automation tests, `npm audit --audit-level=high` (zero vulnerabilities), secret scan and bundle budget. Local Node was 24.19.0/npm 11.9.0, not CI's pinned 24.21.0/npm 10.9.9. Chromium download returned an invalid ZIP; no local browser success is claimed. Baseline GitHub CI and deployed integration provide separate browser evidence.

**NOT READY**: staging rollback, privileged-operation isolation, durable incident escalation, provider recovery and cross-repository proof remain mandatory gates. Do not inject a live failure or infer readiness from green no-op automation runs.
