import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { IndicatorKey } from '../components/IndicatorKey'
import { StatusBadge } from '../components/StatusBadge'

const expected = [
  ['Healthy / resolved / sent / completed', 'bg-emerald-300', 'green'],
  ['Attention / warning / medium priority / pending / escalated / overdue', 'bg-amber-300', 'amber'],
  ['High priority', 'aims-orange', 'red'],
  ['Critical / urgent / failed / blocked / quarantined', 'bg-rose-300', 'red'],
  ['Checking / information / normal priority / open / queued / in progress', 'bg-cyan-300', 'amber'],
  ['Maintenance / standby / snoozed', 'bg-violet-300', 'amber'],
  ['Low priority', 'bg-violet-300', 'green'],
  ['Unknown', 'bg-slate-500', 'amber'],
] as const

test('one collapsible indicator key preserves every distinct lamp without service prefixes', () => {
  const { container } = render(<IndicatorKey />)
  const summary = screen.getByText('Indicator key')
  expect(container.querySelectorAll('details')).toHaveLength(1)
  expect(summary.parentElement).not.toHaveAttribute('open')
  fireEvent.click(summary)
  expect(container.querySelectorAll('.signal-lamp')).toHaveLength(expected.length)
  expect(container.textContent).not.toMatch(/HIVE|AIMS/)
  for (const [label, tone, activeLens] of expected) {
    const lamp = screen.getByText(label).parentElement?.querySelector('.signal-lamp')
    expect(lamp).toHaveAttribute('aria-hidden', 'true')
    expect(lamp).toHaveAttribute('data-tone', tone)
    expect(lamp?.querySelectorAll('[data-active="true"]')).toHaveLength(1)
    expect(lamp?.querySelector('[data-active="true"]')).toHaveAttribute('data-lens', activeLens)
  }
  expect(screen.getByText(/red notification count indicates unread notifications/)).toBeInTheDocument()
})

test.each(['healthy', 'warning', 'failed', 'checking', 'maintenance', 'unknown'])(
  'operational lamp %s is represented in the shared key', (status) => {
    const { container } = render(<><StatusBadge status={status} variant="operational" /><IndicatorKey /></>)
    const lamp = container.querySelector('.signal-lamp')
    const tone = lamp?.getAttribute('data-tone')
    const lens = lamp?.querySelector('[data-active="true"]')?.getAttribute('data-lens')
    const matches = [...container.querySelectorAll('details .signal-lamp')].filter(
      item => item.getAttribute('data-tone') === tone && item.querySelector('[data-active="true"]')?.getAttribute('data-lens') === lens,
    )
    expect(matches).toHaveLength(1)
  },
)
