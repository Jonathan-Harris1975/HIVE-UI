import {
  ArrowDown,
  BrainCircuit,
  ChevronDown,
  CircleStop,
  LoaderCircle,
  Files,
  Paperclip,
  Send,
  Sparkles,
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
import { Link, useSearchParams } from 'react-router'
import { useChat } from '../context/ChatContext'
import { useInspector } from '../context/InspectorContext'
import { apiFetch, chatWithFiles, streamChat } from '../lib/api'
import { formatCost } from '../lib/format'
import type {
  ChatMode,
  ChatRequestPayload,
  FileSourceSelection,
  ModelSummary,
  ModelsResponse,
  StreamEvent,
  UiMessage,
  WorkflowPreset,
} from '../types/api'
import { ChatMessage } from '../components/ChatMessage'
import { ModelPicker } from '../components/ModelPicker'

const modeOptions: Array<{ value: ChatMode; label: string }> = [
  { value: 'auto', label: 'Auto route' },
  { value: 'general', label: 'General' },
  { value: 'brand', label: 'Brand' },
  { value: 'code', label: 'Code' },
  { value: 'audit', label: 'Audit' },
  { value: 'file_analysis', label: 'File analysis' },
]

const starters = [
  { category: 'Operations', border: 'border-amber-300/40', prompt: 'Review the latest HIVE operational risks and give me a safe action order.' },
  { category: 'Debugging', border: 'border-rose-300/40', prompt: 'Help me trace a deployment failure without guessing.' },
  { category: 'Skills', border: 'border-cyan-300/40', prompt: 'Recommend the best shared skills for a new AIMS quality-control task.' },
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

function parseFileSources(value: string | null, fallbackFile: string | null, fallbackLane: string): FileSourceSelection[] {
  if (value) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        const sources: FileSourceSelection[] = []
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue
          const record = item as Record<string, unknown>
          const objectKey = String(record.object_key || '')
          if (!objectKey) continue
          sources.push({
            lane: String(record.lane || fallbackLane || 'uploads'),
            object_key: objectKey,
            name: record.name ? String(record.name) : undefined,
          })
        }
        return sources
      }
    } catch {
      return fallbackFile ? [{ lane: fallbackLane || 'uploads', object_key: fallbackFile }] : []
    }
  }
  return fallbackFile ? [{ lane: fallbackLane || 'uploads', object_key: fallbackFile }] : []
}

function fileSourceLabel(source: FileSourceSelection): string {
  return source.name || source.object_key.split('/').pop() || source.object_key
}

function maxTokensForRoute(mode: ChatMode, hasAttachedFiles: boolean): number {
  if (hasAttachedFiles) return 2400
  if (mode === 'code' || mode === 'audit') return 2600
  if (mode === 'brand' || mode === 'file_analysis') return 2200
  return 1800
}

export function ChatPage() {
  const {
    conversations,
    currentConversationId,
    messages,
    conversationLoading,
    setMessages,
    setCurrentConversationId,
    refreshConversations,
    newConversation,
    autoTitleConversation,
  } = useChat()
  const { setPayload, setOpen } = useInspector()
  const [searchParams, setSearchParams] = useSearchParams()
  const attachedFile = searchParams.get('file')
  const attachedLane = searchParams.get('lane') || 'uploads'
  const attachedSources = useMemo(
    () => parseFileSources(searchParams.get('sources'), attachedFile, attachedLane),
    [attachedFile, attachedLane, searchParams],
  )
  const hasAttachedFiles = attachedSources.length > 0
  const attachedSkillId = searchParams.get('skill_id')
  const attachedSkillTitle = searchParams.get('skill_title')
  const draft = searchParams.get('draft')
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<ChatMode>(hasAttachedFiles ? 'file_analysis' : 'auto')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<ModelSummary[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [workflowPresets, setWorkflowPresets] = useState<WorkflowPreset[]>([])
  const [workflowPreset, setWorkflowPreset] = useState('')
  const [useSkillContext, setUseSkillContext] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const tokenBufferRef = useRef('')
  const tokenFlushTimerRef = useRef<number | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const currentConversationSummary = useMemo(
    () => conversations.find((conversation) => conversation.id === currentConversationId) ?? null,
    [conversations, currentConversationId],
  )

  useEffect(() => {
    void apiFetch<ModelsResponse>('/v1/models')
      .then((response) => setModels(response.models ?? []))
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false))
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
    if (hasAttachedFiles) setMode('file_analysis')
  }, [hasAttachedFiles])

  const conversationUsage = useMemo(() => messages.reduce((total, message) => ({
    tokens: total.tokens + Number(message.usage?.total_tokens ?? message.token_total ?? 0),
    cost: total.cost + Number(message.usage?.cost ?? message.cost_usd ?? 0),
  }), { tokens: 0, cost: 0 }), [messages])

  function removeAttachment() {
    const next = new URLSearchParams(searchParams)
    next.delete('file')
    next.delete('name')
    next.delete('lane')
    next.delete('sources')
    next.delete('skill_id')
    next.delete('skill_title')
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


  function flushTokenBuffer(assistantId: string) {
    const buffered = tokenBufferRef.current
    if (!buffered) return
    tokenBufferRef.current = ''
    setMessages((current) => current.map((message) =>
      message.id === assistantId
        ? { ...message, content: `${message.content}${buffered}`, streaming_count: (message.streaming_count ?? 0) + buffered.length }
        : message,
    ))
  }

  function queueToken(assistantId: string, content: string) {
    tokenBufferRef.current += content
    if (tokenFlushTimerRef.current !== null) return
    tokenFlushTimerRef.current = window.setTimeout(() => {
      tokenFlushTimerRef.current = null
      flushTokenBuffer(assistantId)
    }, 75)
  }

  function clearTokenBuffer() {
    tokenBufferRef.current = ''
    if (tokenFlushTimerRef.current !== null) {
      window.clearTimeout(tokenFlushTimerRef.current)
      tokenFlushTimerRef.current = null
    }
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

  function streamStatusLabel(event: StreamEvent): string | null {
    if (event.type === 'model_attempt') {
      const modelName = typeof event.model_used === 'string' ? event.model_used : 'selected model'
      return `Trying ${modelName}`
    }
    if (event.type === 'model_fallback') {
      return 'Fallback route engaged'
    }
    if (event.type === 'empty_reply_retry') {
      return 'Empty reply detected, trying fallback'
    }
    return typeof event.message === 'string' && event.message ? event.message : null
  }
  function streamWarning(event: StreamEvent): string | null {
    if (event.completion_truncated) {
      if (event.finish_reason === 'stream_timeout') {
        return 'The provider stream paused before it formally finished. The partial answer was saved; send “continue” if you want HIVE to carry on from here.'
      }
      return 'The reply reached the configured token limit. The answer was saved; send “continue” if you want the rest.'
    }
    if (event.db_recorded === false) {
      return `Reply shown but not saved to persistent history${event.db_error ? `: ${event.db_error}` : '.'}`
    }
    return null
  }


  function handleStreamEvent(assistantId: string, event: StreamEvent) {
    if (event.event === 'meta') {
      const eventModel = typeof event.model_used === 'string' ? event.model_used : typeof event.model === 'string' ? event.model : null
      if (event.conversation_id && event.type === 'conversation') setCurrentConversationId(event.conversation_id)
      const status = streamStatusLabel(event)
      if (eventModel || status) {
        setMessages((current) => current.map((message) =>
          message.id === assistantId ? {
            ...message,
            streaming_model: eventModel || message.streaming_model,
            streaming_status: status || message.streaming_status,
          } : message,
        ))
      }
      if (event.type === 'conversation') return
    }
    if (event.event === 'token' && typeof event.content === 'string') {
      queueToken(assistantId, event.content)
      return
    }
    if (event.event === 'error') {
      flushTokenBuffer(assistantId)
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, pending: false, streaming_status: null, error: event.message || 'Streaming failed.' } : message,
      ))
      return
    }
    if (event.event === 'done') {
      flushTokenBuffer(assistantId)
      if (event.conversation_id) setCurrentConversationId(event.conversation_id)
      const warning = streamWarning(event)
      setMessages((current) => current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              pending: false,
              model: event.model_used || message.model || message.streaming_model,
              provider: event.provider || message.provider,
              usage: event.usage || message.usage,
              streaming_status: null,
              warning: warning || message.warning,
              error: event.ok === false && !event.completion_truncated ? event.message || 'The model did not complete the response.' : message.error,
              metadata: {
                ...(message.metadata ?? {}),
                stream: {
                  ok: event.ok,
                  db_recorded: event.db_recorded,
                  db_error: event.db_error,
                  finish_reason: event.finish_reason,
                  completion_truncated: event.completion_truncated,
                  partial_response: event.partial_response,
                },
              },
            }
          : message,
      ))
    }
  }

  async function submitMessage(value?: string) {
    const messageText = (value ?? prompt).trim()
    if (!messageText || streaming) return

    const wasNewConversation = !currentConversationId
    let completedConversationId = currentConversationId
    const userMessage = makeMessage('user', messageText)
    const assistantMessage = makeMessage('assistant', '', true)
    setMessages((current) => [...current, userMessage, assistantMessage])
    setPrompt('')
    setError(null)
    setStreaming(true)
    if (textareaRef.current) textareaRef.current.style.height = '48px'

    clearTokenBuffer()
    const controller = new AbortController()
    abortRef.current = controller
    const payload: ChatRequestPayload = {
      message: messageText,
      mode,
      model: model || null,
      conversation_id: currentConversationId,
      use_persisted_history: true,
      db_history_limit: 12,
      max_tokens: maxTokensForRoute(mode, hasAttachedFiles),
      skill_id: attachedSkillId,
      skill_title: attachedSkillTitle,
      use_skills: useSkillContext && !hasAttachedFiles,
    }

    try {
      if (hasAttachedFiles) {
        const response = await chatWithFiles(attachedSources, { ...payload, workflow_preset: workflowPreset || null }, controller.signal)
        if (!response.ok) throw new Error(response.message || response.error_code || 'File chat failed.')
        if (response.conversation_id) {
          completedConversationId = response.conversation_id
          setCurrentConversationId(response.conversation_id)
        }
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
                  selected_skill: response.selected_skill,
                },
              }
            : message,
        ))
      } else {
        await streamChat(payload, { onEvent: (event) => {
          if (event.conversation_id) completedConversationId = event.conversation_id
          handleStreamEvent(assistantMessage.id, event)
        } }, controller.signal)
      }
      setStreaming(false)
      abortRef.current = null
      await refreshConversations().catch((refreshError) => {
        const message = refreshError instanceof Error ? refreshError.message : 'Conversation list could not refresh.'
        setError(`Persistence refresh failed: ${message}`)
      })
      if (completedConversationId) {
        const canAutoTitle = wasNewConversation || !currentConversationSummary?.title || currentConversationSummary.auto_titled === false
        if (canAutoTitle) {
          void autoTitleConversation(completedConversationId).catch(() => undefined)
        }
      }
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
      clearTokenBuffer()
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
            <div className="flex flex-1 items-center justify-center text-slate-400">
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
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                Auto route chooses the safest configured model policy. Select a specialist mode when you need tighter control.
              </p>
              <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
                {starters.map((starter) => (
                  <button
                    key={starter.category}
                    type="button"
                    onClick={() => void submitMessage(starter.prompt)}
                    className={`rounded-2xl border border-l-2 border-white/8 ${starter.border} bg-white/[0.025] p-4 text-left text-xs leading-5 text-slate-400 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.04] hover:text-slate-200`}
                  >
                    <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300"><Sparkles className="h-3.5 w-3.5 text-cyan-300/70" /> {starter.category}</span>
                    {starter.prompt}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={newConversation} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-medium text-slate-200 transition hover:bg-white/[0.06]">
                  New conversation
                </button>
                <Link to="/files" className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/7 px-3 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/12">
                  <Files className="h-4 w-4" /> Files
                </Link>
                <Link to="/skills" className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300/15 bg-violet-300/7 px-3 text-xs font-medium text-violet-100 transition hover:bg-violet-300/12">
                  <BrainCircuit className="h-4 w-4" /> Skills
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6 py-2">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} onInspect={inspectMessage} />
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
          {(hasAttachedFiles || error) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {hasAttachedFiles && (
                <div className="flex max-w-full items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-3 py-1.5 text-xs text-emerald-100">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="max-w-[260px] truncate">
                    {attachedSources.length === 1
                      ? fileSourceLabel(attachedSources[0])
                      : `${attachedSources.length} files selected`}
                  </span>
                  <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-emerald-100/65">
                    {attachedSources.length === 1
                      ? attachedSources[0].lane.replace(/_/g, ' ')
                      : `${new Set(attachedSources.map((source) => source.lane)).size} lanes`}
                  </span>
                  <button type="button" onClick={removeAttachment} className="rounded-full p-0.5 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {attachedSkillId && (
                <div className="flex max-w-full items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1.5 text-xs text-cyan-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="max-w-[260px] truncate">Skill: {attachedSkillTitle || attachedSkillId}</span>
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
              placeholder={hasAttachedFiles ? 'Ask about the attached files…' : 'Message HIVE…'}
              aria-label={hasAttachedFiles ? 'Ask about the attached files' : 'Message HIVE'}
              className="block min-h-12 max-h-[180px] w-full resize-none bg-transparent px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-400"
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
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                </label>
                <ModelPicker models={models} value={model} onChange={setModel} loading={modelsLoading} />
                {!hasAttachedFiles && (
                  <button
                    type="button"
                    onClick={() => setUseSkillContext((value) => !value)}
                    className={`h-8 rounded-lg border px-3 text-xs font-medium transition ${useSkillContext ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/8 bg-white/[0.035] text-slate-400 hover:bg-white/[0.055] hover:text-slate-200'}`}
                    aria-pressed={useSkillContext}
                    title="Use retrieved HIVE skills for this message. Off keeps ordinary chat fast."
                  >
                    Skills {useSkillContext ? 'on' : 'off'}
                  </button>
                )}
                {hasAttachedFiles && workflowPresets.length > 0 && (
                  <label className="relative max-w-[210px]">
                    <select
                      value={workflowPreset}
                      onChange={(event) => setWorkflowPreset(event.target.value)}
                      className="h-8 w-full appearance-none truncate rounded-lg border border-white/8 bg-white/[0.035] pl-3 pr-8 text-xs text-slate-300 outline-none hover:bg-white/[0.055]"
                    >
                      <option value="">No workflow preset</option>
                      {workflowPresets.map((item) => <option key={String(item.name)} value={String(item.name)}>{item.label || item.name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
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
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Enter sends · Shift + Enter adds a line
            {conversationUsage.tokens > 0 && <> · {conversationUsage.tokens.toLocaleString()} tokens · {formatCost(conversationUsage.cost)}</>}
          </p>
        </form>
      </div>
    </div>
  )
}
