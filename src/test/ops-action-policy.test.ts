import { describe, expect, it } from 'vitest'
import { acquireActionLock, hasCurrentLifecycleApproval, isSnapshotFresh, lifecycleIdempotencyKey, releaseActionLock, safeRepairHandoffFailure } from '../lib/ops-action-policy'

const now = Date.parse('2026-10-19T01:00:00.000Z')
const validReview = {
  repository: 'Jonathan-Harris1975/HIVE-UI',
  review_id: 'review-42',
  head_sha: 'a'.repeat(40),
  proposal_revision: 'proposal-rev-7',
  approval: {
    authenticated_actor: 'owner@example.test',
    head_sha: 'a'.repeat(40),
    proposal_revision: 'proposal-rev-7',
    expires_at: '2026-10-19T01:05:00.000Z',
  },
}

describe('operations action policy', () => {
  it('requires approval for the exact current proposal and full source SHA', () => {
    expect(hasCurrentLifecycleApproval(validReview, now)).toBe(true)
    expect(hasCurrentLifecycleApproval({
      ...validReview,
      head_sha: 'b'.repeat(40),
    }, now)).toBe(false)
    expect(hasCurrentLifecycleApproval({
      ...validReview,
      proposal_revision: 'proposal-rev-8',
    }, now)).toBe(false)
  })

  it('rejects missing, unauthenticated, and expired approval evidence', () => {
    expect(hasCurrentLifecycleApproval({ head_sha: 'a'.repeat(40) }, now)).toBe(false)
    expect(hasCurrentLifecycleApproval({
      ...validReview,
      approval: { ...validReview.approval, authenticated_actor: '' },
    }, now)).toBe(false)
    expect(hasCurrentLifecycleApproval({
      ...validReview,
      approval: { ...validReview.approval, expires_at: '2026-10-19T00:59:59.999Z' },
    }, now)).toBe(false)
  })

  it('admits only one concurrent submission for the same review', () => {
    const locks = new Set<string>()
    expect(acquireActionLock(locks, 'review-42')).toBe(true)
    expect(acquireActionLock(locks, 'review-42')).toBe(false)
    releaseActionLock(locks, 'review-42')
    expect(acquireActionLock(locks, 'review-42')).toBe(true)
  })

  it('uses one idempotency key for retries of the same revision and a new key after change', async () => {
    const first = await lifecycleIdempotencyKey(validReview)
    expect(await lifecycleIdempotencyKey(validReview)).toBe(first)
    expect(await lifecycleIdempotencyKey({
      ...validReview,
      proposal_revision: 'proposal-rev-8',
    })).not.toBe(first)
  })

  it('marks absent, future, and older-than-two-minute snapshots stale', () => {
    expect(isSnapshotFresh(90_000, 100_000)).toBe(true)
    expect(isSnapshotFresh(null, 100_000)).toBe(false)
    expect(isSnapshotFresh(100_001, 100_000)).toBe(false)
    expect(isSnapshotFresh(100_000 - 120_001, 100_000)).toBe(false)
  })

  it('reports repair-provider 403 safely with an actionable request reference', () => {
    const message = safeRepairHandoffFailure(403, 'request-403')
    expect(message).toContain('HTTP 403')
    expect(message).toContain('No repair acceptance is confirmed')
    expect(message).toContain('backend authorisation and provider permissions')
    expect(message).toContain('request-403')
    expect(message).not.toContain('token')
    expect(message).not.toContain('payload')
  })
})
