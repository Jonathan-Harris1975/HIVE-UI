import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StatusBadge } from '../components/StatusBadge'

for (const variant of [undefined, 'liveness', 'readiness', 'operational'] as const) {
  for (const status of ['unknown', 'skipped', 'blocked', 'failed', 'verified']) {
    test(`${variant ?? 'default'} preserves ${status} evidence state`, () => {
      render(<StatusBadge status={status} variant={variant} />)
      expect(screen.getByText(status[0].toUpperCase() + status.slice(1))).toHaveClass('sr-only')
      expect(screen.queryByText('Checking')).not.toBeInTheDocument()
    })
  }
}

test('dot-only badge preserves the accessible status without duplicate visible wording', () => {
  render(<StatusBadge status="ready" label="GREEN" dotOnly />)
  const label = screen.getByText('GREEN')
  expect(label).toHaveClass('sr-only')
  expect(label.parentElement).toHaveAttribute('title', 'GREEN')
  expect(label.parentElement?.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
})


test('renders neutral evidence for unknown, unavailable and disabled statuses', () => {
  for (const status of ['unknown', 'unavailable', 'disabled', 'not_configured']) {
    const { container, unmount } = render(<StatusBadge status={status} variant="readiness" />)
    expect(container.querySelector('.signal-lamp')).toHaveAttribute('data-tone', 'bg-slate-500')
    expect(container.querySelector('[data-active="true"]')).toHaveAttribute('data-lens', 'amber')
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(1)
    expect(container.firstElementChild).toHaveClass('text-slate-400')
    expect(screen.queryByText('Checking')).not.toBeInTheDocument()
    unmount()
  }
})

test('keeps failure and successful readiness colour aligned with status text', () => {
  const { container, rerender } = render(<StatusBadge status="ready" variant="readiness" />)
  expect(container.querySelector('.signal-lamp')).toHaveAttribute('data-tone', 'bg-emerald-300')
  expect(container.querySelector('[data-active="true"]')).toHaveAttribute('data-lens', 'green')
  expect(container.firstElementChild).toHaveClass('text-emerald-200')
  rerender(<StatusBadge status="error" variant="readiness" />)
  expect(container.querySelector('.signal-lamp')).toHaveAttribute('data-tone', 'bg-rose-300')
  expect(container.querySelector('[data-active="true"]')).toHaveAttribute('data-lens', 'red')
  expect(container.firstElementChild).toHaveClass('text-rose-200')
})

test('traffic light retains fixed red amber green order, accessible-only label and exactly one illuminated lens', () => {
  const { container } = render(<StatusBadge status="degraded" variant="operational" />)
  expect(screen.getByText('Degraded')).toHaveClass('sr-only')
  expect(Array.from(container.querySelectorAll('[data-lens]'), lens => lens.getAttribute('data-lens'))).toEqual(['red', 'amber', 'green'])
  expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(1)
  expect(container.querySelector('[data-active="true"]')).toHaveAttribute('data-lens', 'amber')
})

test('all badges hide adjacent status wording, including explicitly false legacy dotOnly', () => {
  for (const status of ['healthy', 'warning', 'failed', 'unknown', 'checking', 'maintenance']) {
    const { container, unmount } = render(<StatusBadge status={status} label={status} dotOnly={false} />)
    expect(screen.getByText(status)).toHaveClass('sr-only')
    expect(container.firstElementChild).toHaveAttribute('title', status)
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(1)
    unmount()
  }
})
