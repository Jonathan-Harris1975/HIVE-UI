interface StatusBadgeProps {
  status?: string | null
  label?: string
  compact?: boolean
  variant?: 'liveness' | 'readiness' | 'operational'
}

function normalise(status: string): string {
  return status.toLowerCase().replace(/\s+/g, '_')
}

function tone(status: string, variant?: StatusBadgeProps['variant']): string {
  const value = normalise(status)
  const neutralStatuses = ['unknown', 'not_configured', 'not-configured', 'disabled', 'unavailable']
  if (neutralStatuses.includes(value)) return 'border-cyan-300/20 bg-cyan-300/8 text-cyan-200'

  // Standby/Maintenance are intentional, not faults: a distinct violet tone keeps
  // them visually separate from both "healthy" green and "fault" red/amber.
  if (['standby', 'maintenance'].includes(value)) return 'border-violet-300/20 bg-violet-300/8 text-violet-200'
  if (['starting'].includes(value)) return 'border-sky-300/20 bg-sky-300/8 text-sky-200'
  if (['busy'].includes(value)) return 'border-amber-300/20 bg-amber-300/8 text-amber-200'

  if (variant === 'liveness') {
    if (['healthy', 'online', 'active', 'ok', 'ready'].includes(value)) return 'border-emerald-300/20 bg-emerald-300/8 text-emerald-200'
    if (['down', 'offline', 'failed', 'error'].includes(value)) return 'border-rose-300/20 bg-rose-300/8 text-rose-200'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'border-amber-300/20 bg-amber-300/8 text-amber-200'
    return 'border-white/10 bg-white/[0.04] text-slate-400'
  }
  if (variant === 'readiness') {
    if (['ready', 'healthy', 'ok'].includes(value)) return 'border-emerald-300/20 bg-emerald-300/8 text-emerald-200'
    if (['not_ready', 'not-ready', 'down', 'failed', 'error'].includes(value)) return 'border-rose-300/20 bg-rose-300/8 text-rose-200'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized', 'partial', 'degraded'].includes(value)) return 'border-amber-300/20 bg-amber-300/8 text-amber-200'
    return 'border-white/10 bg-white/[0.04] text-slate-400'
  }
  if (variant === 'operational') {
    if (['healthy', 'ok', 'active', 'ready'].includes(value)) return 'border-emerald-300/20 bg-emerald-300/8 text-emerald-200'
    if (['down', 'failed', 'error', 'critical'].includes(value)) return 'border-rose-300/20 bg-rose-300/8 text-rose-200'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized', 'degraded', 'partial'].includes(value)) return 'border-amber-300/20 bg-amber-300/8 text-amber-200'
    return 'border-white/10 bg-white/[0.04] text-slate-400'
  }
  if (['complete', 'completed', 'approved', 'healthy', 'ready', 'ready_for_execution', 'ok', 'active'].includes(value)) {
    return 'border-emerald-300/20 bg-emerald-300/8 text-emerald-200'
  }
  if (['blocked', 'rejected', 'failed', 'error', 'high', 'down', 'critical'].includes(value)) {
    return 'border-rose-300/20 bg-rose-300/8 text-rose-200'
  }
  if (['review_required', 'pending_review', 'approved_handoff_pending', 'needs_changes', 'medium', 'warning', 'degraded', 'partial', 'auth_blocked'].includes(value)) {
    return 'border-amber-300/20 bg-amber-300/8 text-amber-200'
  }
  if (['planned', 'queued', 'readonly', 'low', 'not_configured', 'disabled', 'unknown', 'unavailable'].includes(value)) {
    return 'border-cyan-300/20 bg-cyan-300/8 text-cyan-200'
  }
  return 'border-white/10 bg-white/[0.04] text-slate-400'
}

function display(status: string, variant?: StatusBadgeProps['variant']): string {
  const value = normalise(status)
  if (value === 'unknown') return 'Unknown'
  if (['disabled', 'unavailable'].includes(value)) return 'Disabled'
  if (['not_configured', 'not-configured'].includes(value)) return 'Not configured'
  if (value === 'standby') return 'Standby'
  if (value === 'maintenance') return 'Maintenance'
  if (value === 'starting') return 'Starting'
  if (value === 'busy') return 'Busy'

  if (variant === 'liveness') {
    if (['healthy', 'online', 'active', 'ok', 'ready'].includes(value)) return 'Online'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'Blocked'
    if (['down', 'offline', 'failed', 'error'].includes(value)) return 'Offline'
    return 'Unknown'
  }
  if (variant === 'readiness') {
    if (['ready', 'healthy', 'ok'].includes(value)) return 'Ready'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'Auth blocked'
    if (['not_ready', 'not-ready', 'down', 'failed', 'error'].includes(value)) return 'Not ready'
    if (['partial', 'degraded'].includes(value)) return 'Partial'
    return 'Unknown'
  }
  if (variant === 'operational') {
    if (['healthy', 'ok', 'active', 'ready'].includes(value)) return 'Healthy'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'Blocked'
    if (['down', 'failed', 'error', 'critical'].includes(value)) return 'Down'
    if (['partial', 'degraded'].includes(value)) return 'Degraded'
    return 'Unknown'
  }
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function StatusBadge({ status, label, compact = false, variant }: StatusBadgeProps) {
  const value = status?.trim() || 'unknown'
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[11px]'} ${tone(value, variant)}`}>
      {label || display(value, variant)}
    </span>
  )
}
