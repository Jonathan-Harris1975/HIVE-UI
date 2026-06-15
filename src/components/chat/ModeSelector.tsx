import { useState, useRef, useEffect } from 'react'
import { HIVE_MODES, type HiveMode } from '@/types'
import { cx } from '@/utils'

interface ModeSelectorProps {
  value: HiveMode
  onChange: (mode: HiveMode) => void
  compact?: boolean
}

export function ModeSelector({ value, onChange, compact }: ModeSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = HIVE_MODES[value]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cx(
          'hive-btn-surface text-xs gap-1.5',
          compact && 'px-2 py-1',
        )}
        title={current.description}
      >
        <span className="text-hive-accent">{current.icon}</span>
        {!compact && <span>{current.label}</span>}
        <span className="text-hive-textDim text-2xs">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-1 w-52 bg-hive-surface border border-hive-border rounded-hive shadow-hive z-50 py-1 animate-fade-in">
          <p className="hive-section-title px-3 pt-1.5 pb-1">Mode</p>
          {(Object.entries(HIVE_MODES) as [HiveMode, typeof HIVE_MODES[HiveMode]][]).map(
            ([mode, meta]) => (
              <button
                key={mode}
                onClick={() => { onChange(mode); setOpen(false) }}
                className={cx(
                  'w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors',
                  mode === value
                    ? 'bg-hive-accentSoft text-hive-accent'
                    : 'text-hive-textSoft hover:bg-hive-surfaceHi hover:text-hive-text',
                )}
              >
                <span className="text-base shrink-0 mt-0.5">{meta.icon}</span>
                <div>
                  <p className="text-xs font-medium leading-none mb-0.5">{meta.label}</p>
                  <p className="text-2xs text-hive-textDim leading-tight">{meta.description}</p>
                </div>
                {mode === value && (
                  <span className="ml-auto text-hive-accent text-xs shrink-0">✓</span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
