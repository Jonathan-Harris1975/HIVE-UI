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
