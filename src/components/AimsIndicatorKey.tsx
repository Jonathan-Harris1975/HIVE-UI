import { SignalLamp } from './StatusBadge'

// AIMS-UI apps/console/app.js: prioritySignal, statusSignal and notificationSignal.
// AIMS-UI apps/console/styles.css: signal-orange and signal-low have distinct lens positions.
const groups = [
  { id: 'priority', heading: 'AIMS conversation priority', items: [
    ['Critical / urgent', 'bg-rose-300', 'red'],
    ['High', 'aims-orange', 'red'],
    ['Medium', 'bg-amber-300', 'amber'],
    ['Normal', 'bg-cyan-300', 'amber'],
    ['Low', 'bg-violet-300', 'green'],
    ['Unknown', 'bg-slate-500', 'amber'],
  ] },
  { id: 'status', heading: 'AIMS conversation status', items: [
    ['Failed / blocked / quarantined', 'bg-rose-300', 'red'],
    ['Pending / escalated / overdue', 'bg-amber-300', 'amber'],
    ['Open / queued / in progress', 'bg-cyan-300', 'amber'],
    ['Resolved / sent / completed', 'bg-emerald-300', 'green'],
    ['Snoozed', 'bg-violet-300', 'amber'],
    ['Unknown', 'bg-slate-500', 'amber'],
  ] },
  { id: 'severity', heading: 'AIMS notification severity', items: [
    ['Critical', 'bg-rose-300', 'red'],
    ['Warning', 'bg-amber-300', 'amber'],
    ['Information', 'bg-cyan-300', 'amber'],
    ['Unknown severity', 'bg-slate-500', 'amber'],
  ] },
] as const

export function AimsIndicatorKey() {
  return (
    <div className="hive-aims-indicator-key">
      <p>Communications cards: priority above status. Tables: separate columns.</p>
      {groups.map(({ id, heading, items }) => (
        <section key={id} aria-labelledby={`aims-legend-${id}`}>
          <h3 id={`aims-legend-${id}`} className="hive-legend-heading">{heading}</h3>
          <div className="hive-legend-items">
            {items.map(([label, tone, activeLens]) => (
              <span key={`${tone}-${activeLens}`}>
                <SignalLamp tone={tone} activeLens={activeLens} />
                <span>{label}</span>
              </span>
            ))}
          </div>
        </section>
      ))}
      <p>A red notification count indicates unread notifications, not conversation priority.</p>
    </div>
  )
}
