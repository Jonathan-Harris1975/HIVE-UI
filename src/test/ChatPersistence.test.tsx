import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatProvider, useChat } from '../context/ChatContext'
import { ChatMessage } from '../components/ChatMessage'

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
