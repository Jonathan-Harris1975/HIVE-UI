import { AlertTriangle, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export interface ConfirmDialogTextInput {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  required?: boolean
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  summary: string
  objectName?: string
  systems?: string[]
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'destructive'
  busy?: boolean
  confirmDisabled?: boolean
  children?: ReactNode
  textInput?: ConfirmDialogTextInput
  onConfirm: () => void
  onCancel: () => void
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('aria-hidden'))
}

export function ConfirmDialog({
  open,
  title,
  summary,
  objectName,
  systems = [],
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  confirmDisabled = false,
  children,
  textInput,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => {
      if (textInput) {
        panelRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.focus()
      } else {
        cancelRef.current?.focus()
      }
    }, 0)
    return () => {
      document.body.style.overflow = ''
      previousFocusRef.current?.focus()
    }
  }, [open, textInput])

  if (!open) return null

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!busy) onCancel()
      return
    }
    if (event.key === 'Enter' && !textInput?.multiline) {
      const target = event.target as HTMLElement
      if (target.tagName !== 'BUTTON' && !confirmDisabled && !busy && tone !== 'destructive') {
        event.preventDefault()
        onConfirm()
      }
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const items = focusableElements(panelRef.current)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const confirmClasses = tone === 'destructive'
    ? 'border-rose-300/25 bg-rose-300/12 text-rose-100 hover:bg-rose-300/18 focus:ring-rose-300/40'
    : 'border-cyan-300/25 bg-cyan-300/12 text-cyan-100 hover:bg-cyan-300/18 focus:ring-cyan-300/40'

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#020817]/80 px-3 py-4 backdrop-blur-sm sm:items-center" onKeyDown={handleKeyDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#08172b] p-5 shadow-2xl shadow-black/45 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${tone === 'destructive' ? 'border-rose-300/20 bg-rose-300/10 text-rose-200' : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-white">{title}</h2>
              <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-300">{summary}</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Cancel dialog" className="rounded-xl border border-white/8 bg-white/[0.035] p-2 text-slate-400 transition hover:text-white disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3 rounded-2xl border border-white/8 bg-[#061126]/80 p-4 text-xs leading-5 text-slate-300">
          {objectName && <p><span className="font-semibold text-slate-100">Affected object:</span> {objectName}</p>}
          {systems.length > 0 && <p><span className="font-semibold text-slate-100">Systems touched:</span> {systems.join(' · ')}</p>}
          {children}
        </div>

        {textInput && (
          <label className="mt-4 block text-xs font-medium text-slate-300">
            {textInput.label}
            {textInput.multiline ? (
              <textarea
                value={textInput.value}
                onChange={(event) => textInput.onChange(event.target.value)}
                placeholder={textInput.placeholder}
                required={textInput.required}
                rows={4}
                className="mt-2 w-full resize-y rounded-xl border border-white/8 bg-[#061126] px-3 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/40"
              />
            ) : (
              <input
                value={textInput.value}
                onChange={(event) => textInput.onChange(event.target.value)}
                placeholder={textInput.placeholder}
                required={textInput.required}
                className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/40"
              />
            )}
          </label>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="flex h-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] px-4 text-sm font-medium text-slate-200 transition hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-cyan-300/30 disabled:opacity-40">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled} className={`flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-45 ${confirmClasses}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
