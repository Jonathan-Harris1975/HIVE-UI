import { describe, expect, it } from 'vitest'
import { acquireActionLock, hasCurrentLifecycleApproval, isHistoricalLifecycleReport, isSnapshotFresh, lifecycleIdempotencyKey, releaseActionLock, safeRepairHandoffFailure, verifiedReviewSnapshot } from '../lib/ops-action-policy'

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

  it('accepts verified review data and rejects stale or inconsistent payloads', () => {
    const observed_at = '2026-11-19T12:00:00.000Z'
    const current = { source: 'HIVE', review_id: 'review-current', head_sha: 'a'.repeat(40),
      source_verification: 'exact_head_match' }
    const data = { ok: true, scope: 'persisted_human_review_records', observed_at,
      verification_status: 'verified', count: 1, items: [current],
      unverified_count: 0, unverified_items: [] }
    const at = Date.parse(observed_at) + 1000
    expect(verifiedReviewSnapshot(data, at).items).toEqual([current])
    expect(verifiedReviewSnapshot(data, at).status).toBe('verified')
    expect(verifiedReviewSnapshot({ ...data, items: [] }, at).status).toBe('unknown')
    expect(verifiedReviewSnapshot({ ...data, observed_at: '2026-11-19T11:00:00Z' }, at).status).toBe('unknown')
    expect(verifiedReviewSnapshot({ ...data, observed_at: '2026-11-19T13:00:00Z' }, at).status).toBe('unknown')
    expect(verifiedReviewSnapshot({ ...data, items: [{ ...current, head_sha: 'invalid' }] }, at).status).toBe('unknown')
    expect(verifiedReviewSnapshot({ items: [] }, at).status).toBe('unknown')
    const uncertain = { ...data, verification_status: 'unknown', unverified_count: 1,
      unverified_items: [{ review_id: 'review-old', source_verification: 'unknown', reason: 'source_head_mismatch' }] }
    expect(verifiedReviewSnapshot(uncertain, at).status).toBe('unknown')
    expect(verifiedReviewSnapshot(uncertain, at).items).toEqual([current])
    expect(verifiedReviewSnapshot(uncertain, at).unverified).toHaveLength(1)
  })
  it('accepts weekly reports only as historical observations', () => {
    const observed_at = '2026-11-18T12:00:00Z'
    const data = { ok: true, available: true, scope: 'historical_weekly_snapshot',
      live_status_verified: false, observed_at, report: { generated_at: observed_at, overall_status: 'GREEN' } }
    expect(isHistoricalLifecycleReport(data, Date.parse('2026-11-19T00:00:00Z'))).toBe(true)
    expect(isHistoricalLifecycleReport({ ...data, scope: 'live' })).toBe(false)
    expect(isHistoricalLifecycleReport({ ...data, live_status_verified: true })).toBe(false)
    expect(isHistoricalLifecycleReport({ ...data, observed_at: '2026-11-15T00:00:00Z' })).toBe(false)
    expect(isHistoricalLifecycleReport({ ...data, report: { overall_status: 'GREEN' } })).toBe(false)
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
