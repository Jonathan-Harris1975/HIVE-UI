import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StatusBadge } from '../components/StatusBadge'

for (const variant of [undefined, 'liveness', 'readiness', 'operational'] as const) {
  for (const status of ['unknown', 'skipped', 'blocked', 'failed', 'verified']) {
    test(`${variant ?? 'default'} preserves ${status} evidence state`, () => {
      render(<StatusBadge status={status} variant={variant} />)
      expect(screen.getByText(status[0].toUpperCase() + status.slice(1))).toBeVisible()
      expect(screen.queryByText('Checking')).not.toBeInTheDocument()
    })
  }
}

test('dot-only badge preserves the accessible status without duplicate visible wording', () => {
  render(<StatusBadge status="ready" label="GREEN" dotOnly />)
  const label = screen.getByText('GREEN')
  expect(label).toHaveClass('sr-only')
  expect(label.parentElement?.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
})


test('renders neutral evidence for unknown, unavailable and disabled statuses', () => {
  for (const status of ['unknown', 'unavailable', 'disabled', 'not_configured']) {
    const { container, unmount } = render(<StatusBadge status={status} variant="readiness" />)
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('bg-slate-500')
    expect(container.firstElementChild).toHaveClass('text-slate-400')
    expect(screen.queryByText('Checking')).not.toBeInTheDocument()
    unmount()
  }
})

test('keeps failure and successful readiness colour aligned with status text', () => {
  const { container, rerender } = render(<StatusBadge status="ready" variant="readiness" />)
  expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('bg-emerald-300')
  expect(container.firstElementChild).toHaveClass('text-emerald-200')
  rerender(<StatusBadge status="error" variant="readiness" />)
  expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('bg-rose-300')
  expect(container.firstElementChild).toHaveClass('text-rose-200')
})
