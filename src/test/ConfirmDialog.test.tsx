import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { ConfirmDialog } from '../components/ConfirmDialog'

function Harness() {
  const [value, setValue] = useState('')
  return <ConfirmDialog open title="Rename" summary="Rename item" confirmLabel="Save" onConfirm={vi.fn()} onCancel={vi.fn()} textInput={{ label: 'Name', value, onChange: setValue }} />
}

test('editing a confirmation field keeps focus and cursor position', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  const input = screen.getByRole('textbox', { name: 'Name' })
  await user.click(input)
  await user.type(input, 'abcd')
  await user.keyboard('{ArrowLeft}{ArrowLeft}X')
  expect(input).toHaveValue('abXcd')
  expect(input).toHaveFocus()
})
