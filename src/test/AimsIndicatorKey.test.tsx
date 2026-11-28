import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AimsIndicatorKey } from '../components/AimsIndicatorKey'

const expected = [
  ['AIMS conversation priority', [
    ['Critical / urgent', 'bg-rose-300', 'red'], ['High', 'aims-orange', 'red'],
    ['Medium', 'bg-amber-300', 'amber'], ['Normal', 'bg-cyan-300', 'amber'],
    ['Low', 'bg-violet-300', 'green'], ['Unknown', 'bg-slate-500', 'amber'],
  ]],
  ['AIMS conversation status', [
    ['Failed / blocked / quarantined', 'bg-rose-300', 'red'], ['Pending / escalated / overdue', 'bg-amber-300', 'amber'],
    ['Open / queued / in progress', 'bg-cyan-300', 'amber'], ['Resolved / sent / completed', 'bg-emerald-300', 'green'],
    ['Snoozed', 'bg-violet-300', 'amber'], ['Unknown', 'bg-slate-500', 'amber'],
  ]],
  ['AIMS notification severity', [
    ['Critical', 'bg-rose-300', 'red'], ['Warning', 'bg-amber-300', 'amber'],
    ['Information', 'bg-cyan-300', 'amber'], ['Unknown severity', 'bg-slate-500', 'amber'],
  ]],
] as const

test('AIMS indicator key preserves the actual Communications colours and lens positions', () => {
  render(<AimsIndicatorKey />)
  for (const [heading, items] of expected) {
    const section = screen.getByRole('region', { name: heading })
    expect(section.querySelectorAll('.signal-lamp')).toHaveLength(items.length)
    for (const [label, tone, activeLens] of items) {
      const lamp = within(section).getByText(label).parentElement?.querySelector('.signal-lamp')
      expect(lamp).toHaveAttribute('aria-hidden', 'true')
      expect(lamp).toHaveAttribute('data-tone', tone)
      expect(lamp?.querySelectorAll('[data-active="true"]')).toHaveLength(1)
      expect(lamp?.querySelector('[data-active="true"]')).toHaveAttribute('data-lens', activeLens)
    }
  }
  expect(screen.getByText(/red notification count indicates unread notifications/)).toBeInTheDocument()
})
