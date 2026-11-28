import { SignalLamp } from './StatusBadge'

// Keep every distinct colour/lens combination used by the shell and Communications.
// The displayed meaning depends on context, not the originating service.
const indicators = [
  ['Healthy / resolved / sent / completed', 'bg-emerald-300', 'green'],
  ['Attention / warning / medium priority / pending / escalated / overdue', 'bg-amber-300', 'amber'],
  ['High priority', 'aims-orange', 'red'],
  ['Critical / urgent / failed / blocked / quarantined', 'bg-rose-300', 'red'],
  ['Checking / information / normal priority / open / queued / in progress', 'bg-cyan-300', 'amber'],
  ['Maintenance / standby / snoozed', 'bg-violet-300', 'amber'],
  ['Low priority', 'bg-violet-300', 'green'],
  ['Unknown', 'bg-slate-500', 'amber'],
] as const

export function IndicatorKey() {
  return (
    <details className="hive-lamp-legend">
      <summary>Indicator key</summary>
      <div className="hive-legend-items">
        {indicators.map(([label, tone, activeLens]) => (
          <span key={`${tone}-${activeLens}`}>
            <SignalLamp tone={tone} activeLens={activeLens} />
            <span>{label}</span>
          </span>
        ))}
      </div>
      <p>Read indicators in context: status, priority or severity. In conversation cards, priority is above status; tables use separate columns.</p>
      <p>A red notification count indicates unread notifications, not conversation priority.</p>
    </details>
  )
}
