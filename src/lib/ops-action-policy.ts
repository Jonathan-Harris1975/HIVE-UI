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
