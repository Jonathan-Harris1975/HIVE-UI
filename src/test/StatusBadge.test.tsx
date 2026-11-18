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
  expect(label.closest('span')?.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
})
