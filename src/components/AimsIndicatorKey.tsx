// AIMS-UI apps/console/app.js: prioritySignal, statusSignal and notificationSignal.
// AIMS-UI apps/console/styles.css: signal-orange and signal-low have distinct lens positions.
const groups = [
  { id: 'priority', heading: 'AIMS conversation priority', items: [
    { id: 'critical-urgent', label: 'Critical / urgent', tone: 'bg-rose-300', activeLens: 'red' },
    { id: 'high', label: 'High', tone: 'aims-orange', activeLens: 'red' },
    { id: 'medium', label: 'Medium', tone: 'bg-amber-300', activeLens: 'amber' },
    { id: 'normal', label: 'Normal', tone: 'bg-cyan-300', activeLens: 'amber' },
    { id: 'low', label: 'Low', tone: 'bg-violet-300', activeLens: 'green' },
    { id: 'unknown-priority', label: 'Unknown', tone: 'bg-slate-500', activeLens: 'amber' },
  ] },
  { id: 'status', heading: 'AIMS conversation status', items: [
    { id: 'failed-blocked-quarantined', label: 'Failed / blocked / quarantined', tone: 'bg-rose-300', activeLens: 'red' },
    { id: 'pending-escalated-overdue', label: 'Pending / escalated / overdue', tone: 'bg-amber-300', activeLens: 'amber' },
    { id: 'open-queued-in-progress', label: 'Open / queued / in progress', tone: 'bg-cyan-300', activeLens: 'amber' },
    { id: 'resolved-sent-completed', label: 'Resolved / sent / completed', tone: 'bg-emerald-300', activeLens: 'green' },
    { id: 'snoozed', label: 'Snoozed', tone: 'bg-violet-300', activeLens: 'amber' },
    { id: 'unknown-status', label: 'Unknown', tone: 'bg-slate-500', activeLens: 'amber' },
  ] },
  { id: 'severity', heading: 'AIMS notification severity', items: [
    { id: 'critical-severity', label: 'Critical', tone: 'bg-rose-300', activeLens: 'red' },
    { id: 'warning', label: 'Warning', tone: 'bg-amber-300', activeLens: 'amber' },
    { id: 'information', label: 'Information', tone: 'bg-cyan-300', activeLens: 'amber' },
    { id: 'unknown-severity', label: 'Unknown severity', tone: 'bg-slate-500', activeLens: 'amber' },
  ] },
] as const

export function AimsIndicatorKey() {
  return (
    <div className="hive-aims-indicator-key">
      <p>Communications cards: priority above status. Tables: separate columns.</p>
      {groups.map(({ id, heading, items }) => (
        <section key={id} aria-label={heading}>
          <h3>{heading}</h3>
          <div className="hive-legend-items">
            {items.map(({ id: itemId, label, tone, activeLens }) => (
              <span key={itemId}>
                <span className="signal-lamp" data-tone={tone} aria-hidden="true">
                  {(['red', 'amber', 'green'] as const).map(lens => (
                    <span key={lens} data-lens={lens} data-active={lens === activeLens} />
                  ))}
                </span>
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
