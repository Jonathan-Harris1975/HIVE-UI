import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatProvider, useChat } from '../context/ChatContext'
import { ChatMessage } from '../components/ChatMessage'
import { MarkdownMessage } from '../components/MarkdownMessage'

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(async (path: string) => path.includes('/v1/db/conversations/')
    ? { ok: true, messages: [
      { id: 'user', role: 'user', content: 'Question', metadata: { ok: false, stream_ended_early: true } },
      { id: 'partial', role: 'assistant', content: 'Partial answer', metadata: { ok: false, stream_ended_early: true } },
      { id: 'truncated', role: 'assistant', content: 'Truncated answer', metadata: { ok: true, completion_truncated: true } },
      { id: 'complete', role: 'assistant', content: 'Complete answer', metadata: { ok: true } },
    ] }
    : { ok: true, conversations: [] }),
}))

function Harness() {
  const { openConversation, messages } = useChat()
  return <><button onClick={() => void openConversation('test')}>Open saved chat</button>
    {messages.map((message) => <ChatMessage key={message.id} message={message} onInspect={() => {}} />)}</>
}

describe('saved chat status', () => {
  it('shows interrupted and truncated warnings after loading without labelling complete messages', async () => {
    render(<ChatProvider><Harness /></ChatProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Open saved chat' }))
    expect(await screen.findByText('This response was interrupted before completion.')).toBeInTheDocument()
    expect(screen.getByText('This response was truncated.')).toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.getByText('Complete answer')).toBeInTheDocument()
  })
})


describe('formatted code', () => {
  it('copies highlighted code text without object representations or nested pre elements', async () => {
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const { container } = render(<MarkdownMessage content={'```js\nconst number = 42;\n```'} />)
    expect(container.querySelector('pre pre')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(write).toHaveBeenCalledWith('const number = 42;')
    expect(screen.getByText('Copied')).toBeInTheDocument()
    write.mockRestore()
  })
})
