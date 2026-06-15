// ── Date formatting ────────────────────────────────────────────────────────
export function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1)    return 'just now'
  if (diffMins < 60)   return `${diffMins}m ago`
  if (diffHours < 24)  return `${diffHours}h ago`
  if (diffDays < 7)    return `${diffDays}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── File size formatting ──────────────────────────────────────────────────
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// ── Cost formatting ───────────────────────────────────────────────────────
export function formatCost(costUsd: string | number | undefined): string {
  if (costUsd === undefined || costUsd === null) return ''
  const n = typeof costUsd === 'string' ? parseFloat(costUsd) : costUsd
  if (isNaN(n)) return ''
  if (n < 0.001) return `$${(n * 1000).toFixed(4)}m`
  if (n < 0.01)  return `$${n.toFixed(5)}`
  return `$${n.toFixed(4)}`
}

// ── Token display ─────────────────────────────────────────────────────────
export function formatTokens(n: number | undefined): string {
  if (!n) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ── Truncate ──────────────────────────────────────────────────────────────
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

// ── Parse SSE chunk text ──────────────────────────────────────────────────
// HIVE SSE chunks are JSON: {"type":"chunk","content":"..."} or {"type":"done"}
export function parseChunk(raw: string): { text?: string; done?: boolean } {
  try {
    const obj = JSON.parse(raw) as { type?: string; content?: string; text?: string }
    if (obj.type === 'done' || obj.type === 'end') return { done: true }
    const text = obj.content ?? obj.text ?? ''
    return { text }
  } catch {
    // plain text fallback
    return { text: raw }
  }
}

// ── Derive conversation title from first message ──────────────────────────
export function deriveTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, ' ').trim()
  return truncate(clean, 60)
}

// ── Skill priority colour ─────────────────────────────────────────────────
export function priorityColour(tier: string): string {
  if (tier.startsWith('P0')) return 'text-hive-badge-p0 bg-hive-accentSoft border-hive-accent/30'
  if (tier.startsWith('P1')) return 'text-teal-300 bg-teal-900/30 border-teal-700/30'
  return 'text-hive-textDim bg-hive-surface border-hive-border'
}

// ── Risk colour ───────────────────────────────────────────────────────────
export function riskColour(risk: string): string {
  if (risk === 'low')    return 'text-hive-success bg-green-900/20 border-green-700/30'
  if (risk === 'medium') return 'text-hive-warning bg-yellow-900/20 border-yellow-700/30'
  return 'text-hive-error bg-red-900/20 border-red-700/30'
}

// ── Status colour (skill install status) ─────────────────────────────────
export function statusColour(status: string): string {
  if (status === 'installed') return 'text-hive-success bg-green-900/20'
  if (status === 'parked')    return 'text-hive-warning bg-yellow-900/20'
  return 'text-hive-textDim bg-hive-surfaceHi'
}

// ── Review plan status colour ─────────────────────────────────────────────
export function planStatusColour(status: string): string {
  if (status === 'approved')       return 'text-hive-success'
  if (status === 'rejected')       return 'text-hive-error'
  if (status === 'needs_changes')  return 'text-hive-warning'
  if (status === 'archived')       return 'text-hive-textDim'
  return 'text-hive-blue' // pending_review
}

// ── Workflow node status colour ───────────────────────────────────────────
export function nodeStatusColour(status?: string, blocked?: boolean): string {
  if (blocked)                return 'border-hive-error/50 bg-red-900/10 text-hive-error'
  if (status === 'complete')  return 'border-hive-success/50 bg-green-900/10 text-hive-success'
  if (status === 'active')    return 'border-hive-accent/50 bg-hive-accentSoft text-hive-accent'
  return 'border-hive-border bg-hive-surface text-hive-textSoft'
}

// ── Class merge helper ────────────────────────────────────────────────────
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
