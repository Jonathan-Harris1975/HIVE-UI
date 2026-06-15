import {
  ArrowDown,
  Bot,
  BrainCircuit,
  ChevronDown,
  CircleStop,
  FileText,
  LoaderCircle,
  Paperclip,
  Send,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useSearchParams } from 'react-router'
import { useChat } from '../context/ChatContext'
import { useInspector } from '../context/InspectorContext'
import { apiFetch, chatWithFile, streamChat } from '../lib/api'
import { formatCost } from '../lib/format'
import type {
  ChatMode,
  ChatRequestPayload,
  ModelSummary,
  ModelsResponse,
  StreamEvent,
  UiMessage,
  WorkflowPreset,
} from '../types/api'
import { MarkdownMessage } from '../components/MarkdownMessage'

const modeOptions: Array<{ value: ChatMode; label: string }> = [
  { value: 'auto', label: 'Auto route' },
  { value: 'general', label: 'General' },
  { value: 'brand', label: 'Brand' },
  { value: 'code', label: 'Code' },
  { value: 'audit', label: 'Audit' },
  { value: 'file_analysis', label: 'File analysis' },
]

const starters = [
  'Review the latest HIVE operational risks and give me a safe action order.',
  'Help me trace a deployment failure without guessing.',
  'Recommend the best shared skills for a new AIMS quality-control task.',
]

function makeMessage(role: 'user' | 'assistant', content: string, pending = false): UiMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    pending,
    local: true,
    created_at: new Date().toISOString(),
  }
}

export function ChatPage() {
  const {
    currentConversationId,
    messages,
    conversationLoading,
    setMessages,
    setCurrentConversationId,
    refreshConversations,
  } = useChat()
  const { setPayload, setOpen } = useInspector()
  const [searchParams, setSearchParams] = useSearchParams()
  const attachedFile = searchParams.get('file')
  const draft = searchParams.get('draft')
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<ChatMode>(attachedFile ? 'file_analysis' : 'auto')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<ModelSummary[]>([])
  const [workflowPresets, setWorkflowPresets] = useState<WorkflowPreset[]>([])
  const [workflowPreset, setWorkflowPreset] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    void apiFetch<ModelsResponse>('/v1/models')
      .then((response) => setModels(response.models ?? []))
      .catch(() => setModels([]))
    void apiFetch<{ presets?: WorkflowPreset[] }>('/v1/workflow-presets')
      .then((response) => setWorkflowPresets(response.presets ?? []))
      .catch(() => setWorkflowPresets([]))
  }, [])

  useEffect(() => {
    if (!showScrollButton) endRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth', block: 'end' })
  }, [messages, streaming, showScrollButton])

  useEffect(() => {
    if (!draft) return
    setPrompt(draft)
    const next = new URLSearchParams(searchParams)
    next.delete('draft')
    setSearchParams(next, { replace: true })
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }, [draft, searchParams, setSearchParams])

  useEffect(() => {
    if (attachedFile) setMode('file_analysis')
  }, [attachedFile])

  const sortedModels = useMemo(() => [...models].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)), [models])

  function removeAttachment() {
    const next = new URLSearchParams(searchParams)
    next.delete('file')
    next.delete('name')
    setSearchParams(next, { replace: true })
    setMode('auto')
    setWorkflowPreset('')
  }

  function resizeTextarea() {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }

  function inspectMessage(message: UiMessage) {
    setPayload({
      eyebrow: message.role === 'assistant' ? 'Assistant message' : 'User message',
      title: message.model || (message.role === 'assistant' ? 'HIVE response' : 'Your request'),
      description: message.sourceCitation?.object_key
        ? `Grounded against ${message.sourceCitation.object_key}`
        : undefined,
      rows: [
        { label: 'Role', value: message.role },
        { label: 'Model', value: message.model || 'Auto route / not recorded' },
        { label: 'Provider', value: message.provider || 'Not recorded' },
        { label: 'Tokens', value: String(message.usage?.total_tokens ?? message.token_total ?? 'Not recorded') },
        { label: 'Cost', value: formatCost(message.usage?.cost ?? message.cost_usd) },
      ],
      json: message.metadata ?? undefined,
    })
    setOpen(true)
  }

  function handleStreamEvent(assistantId: string, event: StreamEvent) {
    if (event.event === 'meta' && event.type === 'conversation' && event.conversation_id) {
      setCurrentConversationId(event.conversation_id)
      return
    }
    if (event.event === 'token' && typeof event.content === 'string') {
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, content: `${message.content}${event.content}` } : message,
      ))
      return
    }
    if (event.event === 'error') {
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, pending: false, error: event.message || 'Streaming failed.' } : message,
      ))
      return
    }
    if (event.event === 'done') {
      if (event.conversation_id) setCurrentConversationId(event.conversation_id)
      setMessages((current) => current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              pending: false,
              model: event.model_used || message.model,
              provider: event.provider || message.provider,
              usage: event.usage || message.usage,
              error: event.ok === false ? event.message || 'The model did not complete the response.' : message.error,
            }
          : message,
      ))
    }
  }

  async function submitMessage(value?: string) {
    const messageText = (value ?? prompt).trim()
    if (!messageText || streaming) return

    const userMessage = makeMessage('user', messageText)
    const assistantMessage = makeMessage('assistant', '', true)
    setMessages((current) => [...current, userMessage, assistantMessage])
    setPrompt('')
    setError(null)
    setStreaming(true)
    if (textareaRef.current) textareaRef.current.style.height = '48px'

    const controller = new AbortController()
    abortRef.current = controller
    const payload: ChatRequestPayload = {
      message: messageText,
      mode,
      model: model || null,
      conversation_id: currentConversationId,
      use_persisted_history: true,
      db_history_limit: 40,
      max_tokens: 2048,
    }

    try {
      if (attachedFile) {
        const response = await chatWithFile(attachedFile, { ...payload, workflow_preset: workflowPreset || null }, controller.signal)
        if (!response.ok) throw new Error(response.message || response.error_code || 'File chat failed.')
        if (response.conversation_id) setCurrentConversationId(response.conversation_id)
        setMessages((current) => current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: response.reply || '',
                pending: false,
                model: response.model_used,
                provider: response.provider,
                usage: response.usage,
                sourceCitation: response.source_citation,
                metadata: {
                  retrieval_summary: response.retrieval_summary,
                  source_chunks: response.source_chunks,
                },
              }
            : message,
        ))
      } else {
        await streamChat(payload, { onEvent: (event) => handleStreamEvent(assistantMessage.id, event) }, controller.signal)
      }
      await refreshConversations().catch(() => undefined)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setMessages((current) => current.map((message) =>
          message.id === assistantMessage.id ? { ...message, pending: false, error: 'Generation stopped.' } : message,
        ))
      } else {
        const message = caught instanceof Error ? caught.message : 'HIVE chat failed.'
        setError(message)
        setMessages((current) => current.map((item) =>
          item.id === assistantMessage.id ? { ...item, pending: false, error: message } : item,
        ))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void submitMessage()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitMessage()
    }
  }

  function stopGeneration() {
    abortRef.current?.abort()
  }

  function handleScroll() {
    const element = scrollRef.current
    if (!element) return
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setShowScrollButton(distanceFromBottom > 180)
  }

  function scrollToLatest() {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    setShowScrollButton(false)
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 pb-6 pt-5 sm:px-8">
          {conversationLoading ? (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading conversation
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-cyan-300/10 blur-3xl" />
                <img src="/hive-mark.jpg" alt="" className="relative h-24 w-24 rounded-[28px] border border-cyan-300/15 object-cover opacity-90" />
              </div>
              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">Shared intelligence layer</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">What are we solving?</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
                Auto route chooses the safest configured model policy. Select a specialist mode when you need tighter control.
              </p>
              <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
                {starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void submitMessage(starter)}
                    className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-left text-xs leading-5 text-slate-400 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.04] hover:text-slate-200"
                  >
                    <Sparkles className="mb-3 h-4 w-4 text-cyan-300/70" />
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 py-2">
              {messages.map((message) => (
                <article key={message.id} className={`flex gap-3 sm:gap-4 ${message.role === 'user' ? 'justify-end' : ''}`}>
                  {message.role === 'assistant' && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/8 text-cyan-200">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => inspectMessage(message)}
                    className={`min-w-0 max-w-[88%] text-left ${message.role === 'user' ? 'rounded-2xl rounded-tr-md bg-gradient-to-br from-[#163a59] to-[#102a43] px-4 py-3 text-sm text-slate-100 shadow-lg shadow-black/10' : 'flex-1 rounded-2xl border border-white/8 bg-[#0a192d]/70 px-4 py-4 text-sm leading-7 text-slate-300 sm:px-5'}`}
                  >
                    {message.role === 'assistant' ? (
                      <>
                        {message.content ? <MarkdownMessage content={message.content} /> : message.pending ? (
                          <div className="flex items-center gap-2 text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> HIVE is thinking</div>
                        ) : null}
                        {message.error && <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/8 px-3 py-2 text-xs text-rose-200">{message.error}</p>}
                        {!message.pending && (message.model || (message.usage?.cost ?? message.cost_usd) != null) && (
                          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/6 pt-3 text-[10px] uppercase tracking-[0.12em] text-slate-600">
                            {message.model && <span>{message.model}</span>}
                            {(message.usage?.total_tokens ?? message.token_total) != null && <span>· {message.usage?.total_tokens ?? message.token_total} tokens</span>}
                            {(message.usage?.cost ?? message.cost_usd) != null && <span>· {formatCost(message.usage?.cost ?? message.cost_usd)}</span>}
                          </div>
                        )}
                        {message.sourceCitation?.object_key && (
                          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-300/15 bg-emerald-300/5 px-3 py-2 text-xs text-emerald-200/80">
                            <FileText className="h-3.5 w-3.5" /> {message.sourceCitation.label || message.sourceCitation.object_key}
                          </div>
                        )}
                      </>
                    ) : message.content}
                  </button>
                  {message.role === 'user' && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300">
                      <UserRound className="h-4 w-4" />
                    </div>
                  )}
                </article>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {showScrollButton && (
        <button type="button" onClick={scrollToLatest} className="absolute bottom-[126px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#0b1b31]/95 px-3 py-2 text-xs text-slate-300 shadow-xl shadow-black/30 backdrop-blur hover:border-cyan-300/25 hover:text-cyan-100">
          <ArrowDown className="h-3.5 w-3.5" /> Latest message
        </button>
      )}

      <div className="shrink-0 border-t border-white/8 bg-[#071426]/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
          {(attachedFile || error) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {attachedFile && (
                <div className="flex max-w-full items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-3 py-1.5 text-xs text-emerald-100">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="max-w-[260px] truncate">{searchParams.get('name') || attachedFile}</span>
                  <button type="button" onClick={removeAttachment} className="rounded-full p-0.5 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {error && <span className="text-xs text-rose-300">{error}</span>}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-[#0b1b31] p-2 shadow-2xl shadow-black/20 transition focus-within:border-cyan-300/30 focus-within:ring-4 focus-within:ring-cyan-300/[0.04]">
            <textarea
              ref={textareaRef}
              rows={1}
              value={prompt}
              onChange={(event) => { setPrompt(event.target.value); resizeTextarea() }}
              onKeyDown={handleKeyDown}
              placeholder={attachedFile ? 'Ask about the attached file…' : 'Message HIVE…'}
              className="block min-h-12 max-h-[180px] w-full resize-none bg-transparent px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/6 px-1 pt-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <label className="relative">
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as ChatMode)}
                    className="h-8 appearance-none rounded-lg border border-white/8 bg-white/[0.035] pl-3 pr-8 text-xs text-slate-300 outline-none hover:bg-white/[0.055]"
                  >
                    {modeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
                </label>
                <label className="relative max-w-[230px]">
                  <BrainCircuit className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-300/60" />
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="h-8 w-full appearance-none truncate rounded-lg border border-white/8 bg-white/[0.035] pl-8 pr-8 text-xs text-slate-300 outline-none hover:bg-white/[0.055]"
                  >
                    <option value="">Auto route</option>
                    {sortedModels.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
                </label>
                {attachedFile && workflowPresets.length > 0 && (
                  <label className="relative max-w-[210px]">
                    <select
                      value={workflowPreset}
                      onChange={(event) => setWorkflowPreset(event.target.value)}
                      className="h-8 w-full appearance-none truncate rounded-lg border border-white/8 bg-white/[0.035] pl-3 pr-8 text-xs text-slate-300 outline-none hover:bg-white/[0.055]"
                    >
                      <option value="">No workflow preset</option>
                      {workflowPresets.map((item) => <option key={String(item.name)} value={String(item.name)}>{item.label || item.name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
                  </label>
                )}
              </div>

              {streaming ? (
                <button type="button" onClick={stopGeneration} className="flex h-9 items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/8 px-3 text-xs font-medium text-rose-200 hover:bg-rose-300/12">
                  <CircleStop className="h-4 w-4" /> Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!prompt.trim()}
                  className="flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-3.5 text-xs font-semibold text-[#052035] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Send <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-700">Enter sends · Shift + Enter adds a line · Inspector reveals model and cost details</p>
        </form>
      </div>
    </div>
  )
}
