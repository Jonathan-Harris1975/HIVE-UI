interface StatusBadgeProps {
  status?: string | null
  label?: string
  compact?: boolean
  variant?: 'liveness' | 'readiness' | 'operational'
}

function normalise(status: string): string {
  return status.toLowerCase().replace(/\s+/g, '_')
}

function dotTone(status: string, variant?: StatusBadgeProps['variant']): string {
  const value = normalise(status)

  if (['standby', 'maintenance'].includes(value)) return 'bg-violet-300'
  if (['starting', 'checking', 'unknown', 'not_configured', 'not-configured', 'disabled', 'unavailable'].includes(value)) return 'bg-cyan-300'
  if (['busy', 'warning', 'degraded', 'partial', 'review_required', 'pending_review', 'approved_handoff_pending', 'needs_changes', 'medium', 'blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'bg-amber-300'

  if (variant === 'liveness') {
    if (['healthy', 'online', 'active', 'ok', 'ready'].includes(value)) return 'bg-emerald-300'
    if (['down', 'offline', 'failed', 'error'].includes(value)) return 'bg-rose-300'
  }
  if (variant === 'readiness') {
    if (['ready', 'healthy', 'ok'].includes(value)) return 'bg-emerald-300'
    if (['not_ready', 'not-ready', 'down', 'failed', 'error'].includes(value)) return 'bg-rose-300'
  }
  if (variant === 'operational') {
    if (['healthy', 'ok', 'active', 'ready'].includes(value)) return 'bg-emerald-300'
    if (['down', 'failed', 'error', 'critical'].includes(value)) return 'bg-rose-300'
  }

  if (['complete', 'completed', 'approved', 'healthy', 'ready', 'ready_for_execution', 'ok', 'active', 'low'].includes(value)) return 'bg-emerald-300'
  if (['blocked', 'rejected', 'failed', 'error', 'high', 'down', 'critical'].includes(value)) return 'bg-rose-300'
  if (['planned', 'queued', 'readonly'].includes(value)) return 'bg-cyan-300'
  return 'bg-slate-500'
}

function textTone(status: string): string {
  const dot = dotTone(status)
  if (dot === 'bg-emerald-300') return 'text-emerald-200'
  if (dot === 'bg-amber-300') return 'text-amber-200'
  if (dot === 'bg-rose-300') return 'text-rose-200'
  if (dot === 'bg-violet-300') return 'text-violet-200'
  if (dot === 'bg-cyan-300') return 'text-cyan-200'
  return 'text-slate-400'
}

function display(status: string, variant?: StatusBadgeProps['variant']): string {
  const value = normalise(status)
  if (value === 'unknown') return 'Checking'
  if (value === 'checking') return 'Checking'
  if (value === 'disabled') return 'Disabled'
  if (value === 'unavailable') return 'Unavailable'
  if (['not_configured', 'not-configured'].includes(value)) return 'Not configured'
  if (value === 'standby') return 'Standby'
  if (value === 'maintenance') return 'Maintenance'
  if (value === 'starting') return 'Starting'
  if (value === 'busy') return 'Busy'

  if (variant === 'liveness') {
    if (['healthy', 'online', 'active', 'ok', 'ready'].includes(value)) return 'Online'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'Blocked'
    if (['down', 'offline', 'failed', 'error'].includes(value)) return 'Offline'
    return 'Checking'
  }
  if (variant === 'readiness') {
    if (['ready', 'healthy', 'ok'].includes(value)) return 'Ready'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'Auth blocked'
    if (['not_ready', 'not-ready', 'down', 'failed', 'error'].includes(value)) return 'Not ready'
    if (['partial', 'degraded'].includes(value)) return 'Degraded'
    return 'Checking'
  }
  if (variant === 'operational') {
    if (['healthy', 'ok', 'active', 'ready'].includes(value)) return 'Healthy'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'Blocked'
    if (['down', 'failed', 'error', 'critical'].includes(value)) return 'Down'
    if (['partial', 'degraded'].includes(value)) return 'Degraded'
    return 'Checking'
  }
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function StatusBadge({ status, label, compact = false, variant }: StatusBadgeProps) {
  const value = status?.trim() || 'unknown'
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${textTone(value)}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotTone(value, variant)} shadow-[0_0_8px_currentColor]`} aria-hidden="true" />
      <span>{label || display(value, variant)}</span>
    </span>
  )
}
