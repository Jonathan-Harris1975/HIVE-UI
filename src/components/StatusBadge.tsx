interface StatusBadgeProps {
  status?: string | null
  label?: string
  compact?: boolean
  dotOnly?: boolean
  variant?: 'liveness' | 'readiness' | 'operational'
}

function normalise(status: string): string {
  return status.toLowerCase().replace(/\s+/g, '_')
}

function dotTone(status: string, variant?: StatusBadgeProps['variant']): string {
  const value = normalise(status)

  if (['standby', 'maintenance'].includes(value)) return 'bg-violet-300'
  if (['starting', 'checking', 'info', 'information'].includes(value)) return 'bg-cyan-300'
  if (['unknown', 'not_configured', 'not-configured', 'unavailable', 'disabled'].includes(value)) return 'bg-slate-500'
  if ([
    'busy',
    'warning',
    'stale',
    'degraded',
    'partial',
    'review_required',
    'pending_review',
    'approved_handoff_pending',
    'needs_changes',
    'reverted',
    'medium',
    'auth_blocked',
    'forbidden',
    'unauthorised',
    'unauthorized',
  ].includes(value)) return 'bg-amber-300'

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
    if (['down', 'offline', 'failed', 'error', 'critical'].includes(value)) return 'bg-rose-300'
  }

  if (['verified', 'complete', 'completed', 'approved', 'healthy', 'ready', 'ready_for_execution', 'ok', 'active', 'low'].includes(value)) return 'bg-emerald-300'
  if (['blocked', 'rejected', 'failed', 'error', 'high', 'down', 'critical'].includes(value)) return 'bg-rose-300'
  if (['planned', 'queued', 'readonly', 'proposed'].includes(value)) return 'bg-cyan-300'
  return 'bg-slate-500'
}

function textTone(status: string, variant?: StatusBadgeProps['variant']): string {
  const dot = dotTone(status, variant)
  if (dot === 'bg-emerald-300') return 'text-emerald-200'
  if (dot === 'bg-amber-300') return 'text-amber-200'
  if (dot === 'bg-rose-300') return 'text-rose-200'
  if (dot === 'bg-violet-300') return 'text-violet-200'
  if (dot === 'bg-cyan-300') return 'text-cyan-200'
  return 'text-slate-400'
}

function display(status: string, variant?: StatusBadgeProps['variant']): string {
  const value = normalise(status)
  if (value === 'unknown') return 'Unknown'
  if (value === 'skipped') return 'Skipped'
  if (value === 'verified') return 'Verified'
  if (value === 'failed') return 'Failed'
  if (value === 'blocked') return 'Blocked'
  if (value === 'checking') return 'Checking'
  if (value === 'disabled') return 'Disabled'
  if (value === 'unavailable') return 'Unavailable'
  if (['not_configured', 'not-configured'].includes(value)) return 'Not configured'
  if (value === 'standby') return 'Standby'
  if (value === 'maintenance') return 'Maintenance'
  if (value === 'starting') return 'Starting'
  if (value === 'busy') return 'Busy'
  if (value === 'warning') return 'Attention'
  if (value === 'stale') return 'Stale'
  if (value === 'complete' || value === 'completed') return 'Completed'
  const compoundStatuses = [
    'approved', 'ready_for_execution', 'review_required', 'pending_review',
    'approved_handoff_pending', 'needs_changes', 'reverted', 'planned',
    'queued', 'readonly', 'proposed', 'low', 'medium', 'high',
  ]
  if (compoundStatuses.includes(value)) {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
  }
  if (['info', 'information'].includes(value)) return 'Information'

  if (variant === 'liveness') {
    if (['healthy', 'online', 'active', 'ok', 'ready'].includes(value)) return 'Online'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'Blocked'
    if (['down', 'offline', 'failed', 'error'].includes(value)) return 'Offline'
    return value === 'starting' ? 'Starting' : 'Unknown'
  }
  if (variant === 'readiness') {
    if (['ready', 'healthy', 'ok'].includes(value)) return 'Ready'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'Auth blocked'
    if (['not_ready', 'not-ready', 'down', 'failed', 'error'].includes(value)) return 'Not ready'
    if (['partial', 'degraded'].includes(value)) return 'Degraded'
    return value === 'starting' ? 'Starting' : 'Unknown'
  }
  if (variant === 'operational') {
    if (['healthy', 'ok', 'active', 'ready'].includes(value)) return 'Healthy'
    if (['blocked', 'auth_blocked', 'forbidden', 'unauthorised', 'unauthorized'].includes(value)) return 'Blocked'
    if (['down', 'offline', 'failed', 'error', 'critical'].includes(value)) return 'Down'
    if (['partial', 'degraded'].includes(value)) return 'Degraded'
    return value === 'starting' ? 'Starting' : 'Unknown'
  }
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function StatusBadge({ status, label, compact = false, variant }: StatusBadgeProps) {
  const value = status?.trim() || 'unknown'
  const tone = dotTone(value, variant)
  const statusLabel = label || display(value, variant)
  const activeLens = tone === 'bg-rose-300' ? 'red' : tone === 'bg-emerald-300' ? 'green' : 'amber'
  return (
    <span title={statusLabel} className={`inline-flex shrink-0 items-center font-medium ${compact ? 'text-xs' : 'text-xs'} ${textTone(value, variant)}`}>
      <span className="signal-lamp" aria-hidden="true" data-tone={tone}>
        {(['red', 'amber', 'green'] as const).map((lens) => (
          <span key={lens} data-lens={lens} data-active={lens === activeLens} />
        ))}
      </span>
      <span className="sr-only hive-signal-description">{statusLabel}</span>
    </span>
  )
}
