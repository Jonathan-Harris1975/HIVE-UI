import { useRef } from 'react'
import type { Message } from '@/types'
import { formatCost, formatTokens, formatDateTime, cx } from '@/utils'
import { CopyButton } from '@/components/shared'

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const contentRef = useRef<HTMLDivElement>(null)

  const hasCost = message.cost_usd && parseFloat(message.cost_usd) > 0
  const hasSource = message.source_metadata?.retrieval_source &&
    message.source_metadata.retrieval_source !== 'none'

  return (
    <div
      className={cx(
        'flex gap-3 group animate-fade-in',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* Avatar */}
      <div
        className={cx(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium mt-0.5',
          isUser
            ? 'bg-hive-accent text-white'
            : 'bg-hive-surfaceHi border border-hive-border text-hive-accent',
        )}
      >
        {isUser ? 'JH' : '✦'}
      </div>

      {/* Bubble */}
      <div className={cx('flex flex-col gap-1 max-w-[82%]', isUser && 'items-end')}>
        <div
          className={cx(
            'rounded-hive px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-hive-accentSoft border border-hive-accent/25 text-hive-text'
              : 'bg-hive-surface border border-hive-border text-hive-text',
            isStreaming && 'stream-cursor',
          )}
        >
          {isAssistant ? (
            <div
              ref={contentRef}
              className="message-prose"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>

        {/* Meta row */}
        <div
          className={cx(
            'flex items-center gap-2 text-2xs text-hive-textDim px-1',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
            isUser && 'flex-row-reverse',
          )}
        >
          {/* Timestamp */}
          <span title={formatDateTime(message.created_at)}>
            {formatDateTime(message.created_at)}
          </span>

          {/* Model */}
          {message.model_used && (
            <>
              <span>·</span>
              <span className="font-mono truncate max-w-[140px]" title={message.model_used}>
                {shortModel(message.model_used)}
              </span>
            </>
          )}

          {/* Tokens */}
          {(message.prompt_tokens || message.completion_tokens) && (
            <>
              <span>·</span>
              <span title="prompt / completion tokens">
                {formatTokens(message.prompt_tokens)}↑ {formatTokens(message.completion_tokens)}↓
              </span>
            </>
          )}

          {/* Cost */}
          {hasCost && (
            <>
              <span>·</span>
              <span className="text-hive-textDim" title="Estimated cost">
                {formatCost(message.cost_usd)}
              </span>
            </>
          )}

          {/* Copy */}
          {isAssistant && (
            <CopyButton text={message.content} />
          )}
        </div>

        {/* Source citation (RAG) */}
        {hasSource && isAssistant && (
          <SourceCitation meta={message.source_metadata!} />
        )}
      </div>
    </div>
  )
}

// ── Source citation pill ──────────────────────────────────────────────────
function SourceCitation({ meta }: { meta: NonNullable<Message['source_metadata']> }) {
  const isVector = meta.retrieval_source === 'vectorize'
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-hive-surfaceHi border border-hive-border text-2xs text-hive-textDim w-fit">
      <span className={isVector ? 'text-hive-accent' : 'text-hive-textDim'}>
        {isVector ? '⟡' : '◫'}
      </span>
      <span>
        {isVector
          ? `${meta.vector_hits ?? 0} vector hits`
          : `${meta.sql_fallback_hits ?? 0} SQL hits`}
      </span>
      {meta.object_key && (
        <>
          <span>·</span>
          <span className="font-mono truncate max-w-[140px]" title={meta.object_key}>
            {meta.object_key.split('/').pop()}
          </span>
        </>
      )}
    </div>
  )
}

// ── Very small markdown renderer (no deps) ────────────────────────────────
// Handles: headings, bold, italic, inline code, code blocks, lists, links
// Inspired by BetterChatGPT's approach but scoped to HIVE's needs
function renderMarkdown(text: string): string {
  if (!text) return ''

  let html = escapeHtml(text)

  // Code blocks (must come before inline code)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre><code class="language-${lang || 'text'}">${code.trimEnd()}</code></pre>`,
  )

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')

  // HR
  html = html.replace(/^---+$/gm, '<hr/>')

  // Unordered lists (group consecutive items)
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>$2')

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, (m, items) => {
    if (m.includes('<ul>')) return m
    return `<ol>${items}</ol>`
  })

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  )

  // Paragraphs — wrap non-tagged lines
  html = html
    .split('\n\n')
    .map(block => {
      block = block.trim()
      if (!block) return ''
      if (/^<(h[1-6]|ul|ol|pre|blockquote|hr)/.test(block)) return block
      return `<p>${block.replace(/\n/g, '<br/>')}</p>`
    })
    .join('\n')

  return html
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function shortModel(id: string): string {
  // anthropic/claude-sonnet-4-6 → claude-sonnet-4-6
  // openai/gpt-5-mini → gpt-5-mini
  const parts = id.split('/')
  return parts[parts.length - 1]
}
