// AIMS-UI apps/console/app.js: prioritySignal, statusSignal and notificationSignal.
// AIMS-UI apps/console/styles.css: signal-orange and signal-low have distinct lens positions.
const groups = [
  { heading: 'AIMS conversation priority', items: [
    ['Critical / urgent', 'bg-rose-300', 'red'],
    ['High', 'aims-orange', 'red'],
    ['Medium', 'bg-amber-300', 'amber'],
    ['Normal', 'bg-cyan-300', 'amber'],
    ['Low', 'bg-violet-300', 'green'],
    ['Unknown', 'bg-slate-500', 'amber'],
  ] },
  { heading: 'AIMS conversation status', items: [
    ['Failed / blocked / quarantined', 'bg-rose-300', 'red'],
    ['Pending / escalated / overdue', 'bg-amber-300', 'amber'],
    ['Open / queued / in progress', 'bg-cyan-300', 'amber'],
    ['Resolved / sent / completed', 'bg-emerald-300', 'green'],
    ['Snoozed', 'bg-violet-300', 'amber'],
    ['Unknown', 'bg-slate-500', 'amber'],
  ] },
  { heading: 'AIMS notification severity', items: [
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
      {groups.map(({ heading, items }) => (
        <section key={heading} aria-label={heading}>
          <h3>{heading}</h3>
          <div className="hive-legend-items">
            {items.map(([label, tone, activeLens]) => (
              <span key={label}>
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
