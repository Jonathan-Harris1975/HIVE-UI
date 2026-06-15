import { useState, useRef, useEffect } from 'react'
import { useModels } from '@/hooks/useModels'
import { cx, truncate } from '@/utils'

interface ModelPickerProps {
  value: string
  onChange: (modelId: string) => void
  compact?: boolean
}

export function ModelPicker({ value, onChange, compact }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const { models, loading } = useModels()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = search
    ? models.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase()),
      )
    : models

  const currentModel = models.find(m => m.id === value)
  const displayName = currentModel
    ? truncate(currentModel.name, compact ? 16 : 28)
    : value
      ? truncate(value, compact ? 16 : 28)
      : 'Default'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className={cx('hive-btn-surface text-xs gap-1.5', compact && 'px-2 py-1')}
        title={value || 'Default model'}
      >
        <span className="text-hive-textDim text-2xs">◈</span>
        <span className="font-mono">{displayName}</span>
        <span className="text-hive-textDim text-2xs">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-1 w-72 bg-hive-surface border border-hive-border rounded-hive shadow-hive z-50 animate-fade-in flex flex-col max-h-72">
          <div className="p-2 border-b border-hive-border shrink-0">
            <input
              autoFocus
              type="search"
              placeholder="Search models…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="hive-input text-xs py-1"
            />
          </div>

          <div className="overflow-y-auto flex-1">
            {/* Default / let HIVE decide */}
            <button
              onClick={() => { onChange(''); setOpen(false); setSearch('') }}
              className={cx(
                'w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                !value
                  ? 'bg-hive-accentSoft text-hive-accent'
                  : 'text-hive-textSoft hover:bg-hive-surfaceHi hover:text-hive-text',
              )}
            >
              <span className="text-hive-textDim">✦</span>
              <span className="font-medium">Default (HIVE selects)</span>
              {!value && <span className="ml-auto text-hive-accent">✓</span>}
            </button>

            {filtered.map(model => (
              <button
                key={model.id}
                onClick={() => { onChange(model.id); setOpen(false); setSearch('') }}
                className={cx(
                  'w-full flex flex-col px-3 py-2 text-left transition-colors',
                  model.id === value
                    ? 'bg-hive-accentSoft text-hive-accent'
                    : 'text-hive-textSoft hover:bg-hive-surfaceHi hover:text-hive-text',
                )}
              >
                <span className="text-xs font-medium leading-none mb-0.5">{model.name}</span>
                <span className="text-2xs text-hive-textDim font-mono leading-none">{model.id}</span>
              </button>
            ))}

            {filtered.length === 0 && (
              <p className="text-center text-xs text-hive-textDim py-4">No models found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
