type ApprovalEvidence = {
  authenticated_actor?: unknown
  head_sha?: unknown
  proposal_revision?: unknown
  expires_at?: unknown
}

/**
 * UI-side fail-closed display gate. The HIVE backend must repeat every check
 * authoritatively; a browser response is not itself an approval credential.
 */
export function hasCurrentLifecycleApproval(review: Record<string, unknown>, now = Date.now()): boolean {
  const approval = review.approval
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) return false
  const evidence = approval as ApprovalEvidence
  const headSha = review.head_sha
  const proposalRevision = review.proposal_revision
  const repository = review.repository
  const reviewId = review.review_id
  const expiresAt = typeof evidence.expires_at === 'string' ? Date.parse(evidence.expires_at) : Number.NaN

  return typeof headSha === 'string'
    && /^[a-f0-9]{40}$/i.test(headSha)
    && typeof repository === 'string'
    && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    && typeof reviewId === 'string'
    && reviewId.trim().length > 0
    && typeof proposalRevision === 'string'
    && proposalRevision.trim().length > 0
    && typeof evidence.authenticated_actor === 'string'
    && evidence.authenticated_actor.trim().length > 0
    && evidence.head_sha === headSha
    && evidence.proposal_revision === proposalRevision
    && Number.isFinite(expiresAt)
    && expiresAt > now
}

/** Synchronous duplicate-submission guard for UI event handlers. */
export function acquireActionLock(locks: Set<string>, key: string): boolean {
  if (locks.has(key)) return false
  locks.add(key)
  return true
}

export function releaseActionLock(locks: Set<string>, key: string): void {
  locks.delete(key)
}

export function isSnapshotFresh(receivedAt: number | null, now = Date.now(), maxAgeMs = 120_000): boolean {
  return receivedAt !== null && Number.isFinite(receivedAt) && receivedAt <= now && now - receivedAt <= maxAgeMs
}

export function safeRepairHandoffFailure(status: number, requestId: string | null): string {
  const requestRef = requestId ? ` Request ID: ${requestId}.` : ''
  if (status === 403) {
    return [
      'HIVE or the repair provider rejected the handoff (HTTP 403). No repair acceptance is confirmed.',
      `Check backend authorisation and provider permissions, then verify the review and current PR head before retrying.${requestRef}`,
    ].join(' ')
  }
  return `Repair handoff was not confirmed (HTTP ${status}). Check HIVE’s redacted logs and re-read the review before retrying.${requestRef}`
}

/** Stable across retries for the same review, proposal revision and source SHA. */
export async function lifecycleIdempotencyKey(review: Record<string, unknown>): Promise<string> {
  const material = [review.repository, review.review_id, review.proposal_revision, review.head_sha]
    .map((value) => typeof value === 'string' ? value : '')
    .join('\u0000')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `hive-ui-${hex}`
}

/** Authoritative source verification must be fresh; HTTP retrieval alone is not evidence. */
export type VerifiedReviewSnapshot = {
  status: 'verified' | 'unknown'
  items: Array<Record<string, unknown>>
  unverified: Array<Record<string, unknown>>
  observedAt: string | null
  error: string | null
}
export function verifiedReviewSnapshot(payload: unknown, now = Date.now()): VerifiedReviewSnapshot {
  const unknown = (error: string): VerifiedReviewSnapshot =>
    ({ status: 'unknown', items: [], unverified: [], observedAt: null, error })
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return unknown('HIVE returned no verifiable review snapshot.')
  }
  const source = payload as Record<string, unknown>
  if (source.ok !== true || source.scope !== 'persisted_human_review_records'
    || (source.verification_status !== 'verified' && source.verification_status !== 'unknown')
    || !Array.isArray(source.items) || !Array.isArray(source.unverified_items)
    || source.count !== source.items.length || source.unverified_count !== source.unverified_items.length) {
    return unknown('HIVE returned incomplete review verification metadata.')
  }
  const observedAt = source.observed_at
  const timestamp = typeof observedAt === 'string' ? Date.parse(observedAt) : Number.NaN
  if (!Number.isFinite(timestamp) || now - timestamp > 120_000 || timestamp - now > 30_000) {
    return unknown('HIVE review-source verification is stale or undated.')
  }
  const items = source.items as Array<Record<string, unknown>>
  const unverified = source.unverified_items as Array<Record<string, unknown>>
  if (!items.every((item) => item && typeof item === 'object' && !Array.isArray(item)
    && item.source_verification === 'exact_head_match'
    && typeof item.review_id === 'string' && item.review_id.length > 0
    && typeof item.source === 'string' && item.source.length > 0
    && typeof item.head_sha === 'string' && /^[a-f0-9]{40}$/i.test(item.head_sha))
    || !unverified.every((item) => item && typeof item === 'object' && !Array.isArray(item)
      && item.source_verification === 'unknown'
      && typeof item.review_id === 'string' && item.review_id.length > 0
      && (item.reason === 'source_head_mismatch' || item.reason === 'source_head_unavailable'))
    || (source.verification_status === 'verified' && unverified.length > 0)) {
    return unknown('HIVE review-source verification is inconsistent.')
  }
  return {
    status: source.verification_status,
    items, unverified, observedAt: typeof observedAt === 'string' ? observedAt : null,
    error: unverified.length ? 'Some stored human reviews cannot be verified against current GitHub heads.' : null,
  }
}
/** A weekly R2 report is a historical observation, never current repository health. */
export function isHistoricalLifecycleReport(payload: unknown, now = Date.now()): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const response = payload as Record<string, unknown>
  const report = response.report
  if (response.ok !== true || response.available !== true
    || response.scope !== 'historical_weekly_snapshot' || response.live_status_verified !== false
    || !report || typeof report !== 'object' || Array.isArray(report)) return false
  const data = report as Record<string, unknown>
  const observedAt = response.observed_at
  const millis = typeof observedAt === 'string' ? Date.parse(observedAt) : Number.NaN
  return typeof data.generated_at === 'string' && observedAt === data.generated_at
    && Number.isFinite(millis) && millis <= now + 30_000
}
