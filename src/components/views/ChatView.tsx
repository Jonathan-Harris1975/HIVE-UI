import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Message, HiveMode } from '@/types'
import { chat } from '@/api/hive'
import { streamPost, HiveApiError } from '@/api/client'
import { parseChunk, deriveTitle } from '@/utils'
import { useConversations, useConversation } from '@/hooks/useConversations'
import { ConversationSidebar } from '@/components/chat/ConversationSidebar'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ChatInput } from '@/components/chat/ChatInput'
import { EmptyState, ErrorBanner } from '@/components/shared'
import { Spinner } from '@/components/shared'

export function ChatView() {
  const { conversationId } = useParams<{ conversationId?: string }>()
  const navigate = useNavigate()

  // Conversations list (sidebar)
  const { list: convoList, loading: listLoading, refresh: refreshList } = useConversations()
  // Active conversation messages
  const { data: activeConvo, loading: convoLoading, setData } = useConversation(conversationId ?? null)

  // Local state
  const [mode, setMode]           = useState<HiveMode>('auto')
  const [model, setModel]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [error, setError]         = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConvo?.messages?.length, streamBuffer])

  // ── Send message ──────────────────────────────────────────────────────
  const handleSend = useCallback(async (userText: string) => {
    setError(null)
    setStreamBuffer('')

    // Optimistically append user message to UI
    const tempUserMsg: Message = {
      message_id: `temp-${Date.now()}`,
      conversation_id: conversationId ?? '',
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    }
    setData(prev => prev
      ? { ...prev, messages: [...(prev.messages ?? []), tempUserMsg] }
      : null,
    )

    // Start streaming
    setStreaming(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    let accumulated = ''

    try {
      const req = {
        message: userText,
        mode,
        model: model || undefined,
        conversation_id: conversationId,
      }

      for await (const raw of streamPost('/v1/chat/stream', req, ctrl.signal)) {
        const { text, done } = parseChunk(raw)
        if (done) break
        if (text) {
          accumulated += text
          setStreamBuffer(accumulated)
        }
      }

      // Stream complete — append assistant message
      const assistantMsg: Message = {
        message_id: `stream-${Date.now()}`,
        conversation_id: conversationId ?? '',
        role: 'assistant',
        content: accumulated,
        model_used: model || undefined,
        created_at: new Date().toISOString(),
      }

      setData(prev => prev
        ? { ...prev, messages: [...(prev.messages ?? []), assistantMsg] }
        : null,
      )

      // If this was a new conversation, navigate to it and refresh list
      if (!conversationId) {
        // Try to get conversation ID from a non-streaming send
        try {
          const res = await chat.send({ message: userText, mode, model: model || undefined })
          if (res.conversation_id) navigate(`/chat/${res.conversation_id}`)
        } catch {
          // ignore — we already have the response
        }
      }

      await refreshList()

    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // User stopped — keep what we have
        if (accumulated) {
          setData(prev => prev
            ? {
                ...prev,
                messages: [
                  ...(prev.messages ?? []),
                  {
                    message_id: `aborted-${Date.now()}`,
                    conversation_id: conversationId ?? '',
                    role: 'assistant',
                    content: accumulated + ' [stopped]',
                    created_at: new Date().toISOString(),
                  },
                ],
              }
            : null,
          )
        }
      } else {
        const err = e as HiveApiError
        setError(err.detail ?? err.message ?? 'Stream error')
      }
    } finally {
      setStreaming(false)
      setStreamBuffer('')
      abortRef.current = null
    }
  }, [conversationId, mode, model, navigate, refreshList, setData])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleNew = useCallback(() => {
    navigate('/chat')
    setData(null)
    setStreamBuffer('')
    setError(null)
  }, [navigate, setData])

  // ── Rendered messages ──────────────────────────────────────────────────
  const messages = activeConvo?.messages ?? []
  const isLoading = convoLoading && !!conversationId

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <ConversationSidebar
        conversations={convoList}
        loading={listLoading}
        onNew={handleNew}
        onRefresh={refreshList}
      />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-hive-border shrink-0">
          <span className="text-sm font-medium text-hive-text truncate">
            {activeConvo?.title || (conversationId ? 'Loading…' : 'New Conversation')}
          </span>
          {conversationId && (
            <span className="text-2xs text-hive-textDim font-mono ml-auto shrink-0">
              {conversationId.slice(0, 8)}…
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : messages.length === 0 && !streaming ? (
            <WelcomeScreen onPrompt={handleSend} />
          ) : (
            <>
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.message_id}
                  message={msg}
                  isStreaming={false}
                />
              ))}

              {/* Live stream buffer */}
              {streaming && streamBuffer && (
                <MessageBubble
                  message={{
                    message_id: 'streaming',
                    conversation_id: conversationId ?? '',
                    role: 'assistant',
                    content: streamBuffer,
                    created_at: new Date().toISOString(),
                  }}
                  isStreaming
                />
              )}

              {/* Streaming indicator (no content yet) */}
              {streaming && !streamBuffer && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-hive-surfaceHi border border-hive-border flex items-center justify-center text-hive-accent text-xs">
                    ✦
                  </div>
                  <div className="flex items-center gap-1.5 px-4 py-3 bg-hive-surface border border-hive-border rounded-hive">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-hive-accent rounded-full animate-pulse-dot"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          mode={mode}
          onModeChange={setMode}
          model={model}
          onModelChange={setModel}
          streaming={streaming}
          disabled={isLoading}
        />
      </div>
    </div>
  )
}

// ── Welcome screen with prompt suggestions ─────────────────────────────────
const SUGGESTIONS = [
  { icon: '⊞', text: 'What did the SEO council find this month?' },
  { icon: '◈', text: 'Draft back matter for my ChatGPT fundamentals book' },
  { icon: '⟨⟩', text: 'Review my AIMS ai-config.js model routing' },
  { icon: '✦', text: 'What jobs are due in MAST this week?' },
]

function WelcomeScreen({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-hive bg-hive-accentSoft border border-hive-accent/30 flex items-center justify-center">
          <svg viewBox="0 0 32 32" className="w-7 h-7">
            <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="#7c75ed" opacity="0.9"/>
            <polygon points="16,7 23,11 23,21 16,25 9,21 9,11" fill="#1c2a3e"/>
            <circle cx="16" cy="16" r="3.5" fill="#7c75ed"/>
          </svg>
        </div>
        <h2 className="text-base font-semibold text-hive-text">HIVE</h2>
        <p className="text-xs text-hive-textDim">Harris Intelligent Virtual Entity</p>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onPrompt(s.text)}
            className="hive-card flex items-start gap-2 text-left hover:border-hive-accent/40 hover:bg-hive-surfaceHi transition-all p-3"
          >
            <span className="text-hive-accent text-base shrink-0">{s.icon}</span>
            <span className="text-xs text-hive-textSoft leading-snug">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
