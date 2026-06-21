import { Bot, Check, Copy, ExternalLink, FileText, Info, LoaderCircle, UserRound } from 'lucide-react'
import { useState } from 'react'
import { formatCost } from '../lib/format'
import type { UiMessage } from '../types/api'
import { MarkdownMessage } from './MarkdownMessage'

interface ChatMessageProps {
  message: UiMessage
  onInspect: (message: UiMessage) => void
}

export function ChatMessage({ message, onInspect }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const assistant = message.role === 'assistant'
  const streamingCount = message.streaming_count ?? message.content.length

  async function copyMessage() {
    if (!message.content) return
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <article className={`group flex gap-3 sm:gap-4 ${assistant ? '' : 'justify-end'}`} aria-busy={Boolean(message.pending)}>
      {assistant && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/8 text-cyan-200" aria-hidden="true">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={`min-w-0 max-w-[88%] ${assistant ? 'flex-1' : ''}`}>
        <div className={assistant
          ? 'rounded-2xl border border-white/8 bg-[#0a192d]/70 px-4 py-4 text-sm leading-7 text-slate-300 sm:px-5'
          : 'rounded-2xl rounded-tr-md bg-gradient-to-br from-[#163a59] to-[#102a43] px-4 py-3 text-sm text-slate-100 shadow-lg shadow-black/10'}
        >
          {assistant ? (
            <>
              {message.content ? <MarkdownMessage content={message.content} /> : null}
              {message.pending && (
                <div className={`${message.content ? 'mt-4 border-t border-white/6 pt-3' : ''} flex items-center gap-2 text-slate-400`} role="status" aria-live="polite">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span>HIVE is thinking</span>
                  <span className="text-[11px] text-slate-500">{[message.streaming_model, `~${streamingCount.toLocaleString()} chars`].filter(Boolean).join(' · ')}</span>
                </div>
              )}
              {message.error && <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/8 px-3 py-2 text-xs text-rose-200" role="alert">{message.error}</p>}
              {!message.pending && (message.model || (message.usage?.cost ?? message.cost_usd) != null) && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/6 pt-3 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                  {message.model && <span>{message.model}</span>}
                  {(message.usage?.total_tokens ?? message.token_total) != null && <span>· {message.usage?.total_tokens ?? message.token_total} tokens</span>}
                  {(message.usage?.cost ?? message.cost_usd) != null && <span>· {formatCost(message.usage?.cost ?? message.cost_usd)}</span>}
                </div>
              )}
              {message.sourceCitation?.object_key && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-300/15 bg-emerald-300/5 px-3 py-2 text-xs text-emerald-200/80">
                  <span className="flex min-w-0 items-center gap-2"><FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{message.sourceCitation.label || message.sourceCitation.object_key}</span>{message.sourceCitation.lane && <span className="shrink-0 rounded-full bg-black/15 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-emerald-100/70">{message.sourceCitation.lane.replace(/_/g, ' ')}</span>}</span>
                  {message.sourceCitation.public_url && (
                    <a href={message.sourceCitation.public_url} target="_blank" rel="noreferrer" className="shrink-0 rounded-md p-1 text-emerald-200/70 hover:bg-white/8 hover:text-emerald-100" aria-label="Open cited source">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}
            </>
          ) : <p className="whitespace-pre-wrap leading-6">{message.content}</p>}
        </div>

        <div className={`mt-1.5 flex items-center gap-1 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${assistant ? 'justify-start' : 'justify-end'}`}>
          <button type="button" onClick={() => void copyMessage()} disabled={!message.content} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-slate-400 hover:bg-white/5 hover:text-slate-300 disabled:opacity-30" aria-label="Copy message">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={() => onInspect(message)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-slate-400 hover:bg-white/5 hover:text-cyan-200" aria-label="Inspect message details">
            <Info className="h-3.5 w-3.5" /> Inspect
          </button>
        </div>
      </div>

      {!assistant && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300" aria-hidden="true">
          <UserRound className="h-4 w-4" />
        </div>
      )}
    </article>
  )
}
