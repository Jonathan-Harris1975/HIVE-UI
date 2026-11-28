import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState('Copy')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const text = String(children ?? '').replace(/\n$/, '')
  const language = className?.replace('language-', '') ?? 'text'

  async function copyCode() {
    try { await navigator.clipboard.writeText(text); setCopied('Copied') } catch { setCopied('Copy failed') }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied('Copy'), 1600)
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/10 bg-hive-code">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs uppercase tracking-[0.15em] text-slate-400">
        <span>{language}</span>
        <button type="button" onClick={copyCode} className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-200">
          {copied === 'Copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span role="status">{copied}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6"><code className={className}>{children}</code></pre>
    </div>
  )
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose-hive">
      <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        img({ alt }) { return <span>{alt || 'Image omitted'}</span> },
        code({ className, children, ...props }) {
          const isBlock = Boolean(className) || String(children).includes('\n')
          if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>
          return <code className="rounded bg-white/10 px-1.5 py-0.5 text-[0.9em] text-cyan-100" {...props}>{children}</code>
        },
        a({ children, ...props }) {
          return <a className="text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 hover:text-cyan-200" {...props} target="_blank" rel="noopener noreferrer">{children}</a>
        },
        table({ children }) {
          return <div className="my-4 overflow-x-auto rounded-xl border border-white/10"><table className="w-full border-collapse text-sm">{children}</table></div>
        },
        th({ children }) {
          return <th className="border-b border-white/10 bg-white/5 px-3 py-2 text-left font-semibold text-slate-200">{children}</th>
        },
        td({ children }) {
          return <td className="border-b border-white/5 px-3 py-2 align-top text-slate-300">{children}</td>
        },
      }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
