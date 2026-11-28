import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Search, X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface Props {
  items: { to: string; label: string }[]
  onClose: () => void
  onSelect: (to: string) => void
}

export function CommandPalette({ items, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const results = items.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()))
  const selected = Math.min(index, Math.max(0, results.length - 1))
  useEffect(() => {
    const element = dialog.current
    const prior = document.activeElement as HTMLElement | null
    element?.showModal()
    input.current?.focus()
    return () => { element?.close(); prior?.focus() }
  }, [])
  function keydown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length) setIndex((selected + results.length + (event.key === 'ArrowDown' ? 1 : -1)) % results.length)
    } else if (event.key === 'Enter' && results[selected] && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onSelect(results[selected].to)
    }
  }
  return createPortal(
    <dialog ref={dialog} aria-label="Command palette" onCancel={event => { event.preventDefault(); onClose() }}
      className="hive-command-palette w-[min(480px,calc(100vw-24px))] max-h-[80dvh] overflow-y-auto rounded-hive border border-hive-border bg-hive-panel p-3 text-hive-text">
      <div className="flex items-center gap-2 border-b border-hive-border pb-2">
        <Search className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
        <input ref={input} value={query} onChange={event => { setQuery(event.target.value); setIndex(0) }}
          onKeyDown={keydown} aria-label="Find a page" placeholder="Find a page…" autoComplete="off"
          aria-controls="hive-command-results" className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none" />
        <button type="button" aria-label="Close command palette" onClick={onClose}
          className="grid min-h-11 min-w-11 place-items-center rounded-hive"><X className="h-5 w-5" /></button>
      </div>
      <ul id="hive-command-results" className="mt-2 grid gap-1">
        {results.map((item, i) => <li key={item.to}>
          <button type="button" onClick={() => onSelect(item.to)} data-selected={i === selected}
            className="hive-command-result min-h-11 w-full rounded-hive px-3 text-left text-sm">{item.label}</button>
        </li>)}
      </ul>
      {!results.length && <p role="status" className="p-3 text-sm text-hive-muted">No matching pages.</p>}
    </dialog>, document.body,
  )
}
