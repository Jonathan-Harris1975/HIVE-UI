import {
  BrainCircuit,
  Check,
  ChevronDown,
  Image,
  Search,
  Sparkles,
  Video,
  X,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ModelSummary } from '../types/api'

interface ModelPickerProps {
  models: ModelSummary[]
  value: string
  onChange: (value: string) => void
  loading?: boolean
}

const GROUP_ORDER = [
  'configured',
  'free',
  'reasoning',
  'coding',
  'documents',
  'vision',
  'video_analysis',
  'general',
  'audio',
  'image_generation',
  'video_generation',
  'other',
]

const GROUP_LABELS: Record<string, string> = {
  configured: 'HIVE configured',
  free: 'Free',
  reasoning: 'Reasoning',
  coding: 'Coding',
  documents: 'Long context & documents',
  vision: 'Vision / image analysis',
  video_analysis: 'Video analysis',
  general: 'General chat',
  audio: 'Audio & speech',
  image_generation: 'Image generation',
  video_generation: 'Video generation',
  other: 'Other models',
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function modelLabel(model: ModelSummary): string {
  return stringValue(model.name) ?? model.id
}

function compactContext(value: unknown): string | null {
  const parsed = numberValue(value)
  if (!parsed || parsed < 1) return null
  if (parsed >= 1_000_000) return `${Math.round(parsed / 100_000) / 10}M context`
  if (parsed >= 1_000) return `${Math.round(parsed / 1_000)}K context`
  return `${parsed} context`
}

function groupIcon(group: string) {
  if (group === 'image_generation') return <Image className="h-3.5 w-3.5" />
  if (group === 'video_generation' || group === 'video_analysis') return <Video className="h-3.5 w-3.5" />
  return <Sparkles className="h-3.5 w-3.5" />
}

function categoryLabel(group: string): string {
  return GROUP_LABELS[group] || group.replace(/_/g, ' ')
}

export function ModelPicker({ models, value, onChange, loading = false }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()

  const visibleModels = useMemo(() => models, [models])
  const selected = useMemo(
    () => visibleModels.find((model) => model.id === value) ?? null,
    [value, visibleModels],
  )

  const categoryChoices = useMemo(() => {
    const counts = new Map<string, number>()
    for (const model of visibleModels) {
      const group = stringValue(model.primary_group) ?? 'other'
      counts.set(group, (counts.get(group) ?? 0) + 1)
    }
    return GROUP_ORDER
      .filter((group) => counts.has(group))
      .map((group) => ({ group, count: counts.get(group) ?? 0 }))
  }, [visibleModels])

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = visibleModels.filter((model) => {
      const group = stringValue(model.primary_group) ?? 'other'
      if (category !== 'all' && group !== category) return false
      if (!needle) return true
      return [
        model.id,
        model.name,
        model.description,
        ...stringArray(model.configured_roles),
        ...stringArray(model.groups),
        ...stringArray(model.input_modalities),
        ...stringArray(model.output_modalities),
      ].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })

    const groups = new Map<string, ModelSummary[]>()
    for (const model of matches) {
      const group = stringValue(model.primary_group) ?? 'other'
      const current = groups.get(group) ?? []
      current.push(model)
      groups.set(group, current)
    }
    for (const items of groups.values()) {
      items.sort((a, b) => modelLabel(a).localeCompare(modelLabel(b)))
    }
    return GROUP_ORDER
      .filter((group) => groups.has(group))
      .map((group) => ({ group, models: groups.get(group) ?? [] }))
  }, [category, query, visibleModels])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function selectModel(model: ModelSummary | null) {
    onChange(model?.id ?? '')
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Choose HIVE model"
        className="flex h-8 max-w-[260px] items-center gap-2 rounded-lg border border-white/8 bg-white/[0.035] px-2.5 text-left text-xs text-slate-300 outline-none transition hover:bg-white/[0.055]"
      >
        <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-cyan-300/70" />
        <span className="min-w-0 flex-1 truncate">{selected ? modelLabel(selected) : loading ? 'Loading models…' : 'Auto route'}</span>
        {selected?.is_free === true && <span className="hidden rounded bg-emerald-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-200 sm:inline">Free</span>}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-[min(94vw,460px)] overflow-hidden rounded-2xl border border-white/10 bg-[#09182b]/98 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="space-y-2 border-b border-white/8 p-3">
            <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Model type</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
              aria-label="Filter models by category"
            >
              <option value="all">All model types · {visibleModels.length}</option>
              {categoryChoices.map(({ group, count }) => (
                <option key={group} value={group}>{categoryLabel(group)} · {count}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models, providers or capabilities"
                aria-label="Search models"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#061126] pl-9 pr-9 text-xs text-slate-200 outline-none placeholder:text-slate-400 focus:border-cyan-300/30"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-slate-300" aria-label="Clear model search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div id={listId} role="listbox" aria-label="HIVE models" className="max-h-[min(56vh,460px)] overflow-y-auto p-2">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => selectModel(null)}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-cyan-300/[0.06]"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/7 text-cyan-200"><BrainCircuit className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">Auto route {!value && <Check className="h-3.5 w-3.5 text-emerald-300" />}</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">Let HIVE choose the configured model for the task and fallback policy.</p>
              </div>
            </button>

            {grouped.map(({ group, models: groupModels }) => (
              <section key={group} className="mt-2" aria-label={categoryLabel(group)}>
                <div className="sticky top-0 z-10 flex items-center justify-between bg-[#09182b]/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 backdrop-blur">
                  <span className="flex items-center gap-1.5">{groupIcon(group)} {categoryLabel(group)}</span>
                  <span>{groupModels.length}</span>
                </div>
                <div className="space-y-0.5">
                  {groupModels.map((item) => {
                    const active = item.id === value
                    const context = compactContext(item.context_length)
                    const chatSelectable = item.chat_selectable !== false
                    const advisory = chatSelectable ? null : stringValue(item.disabled_reason)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        aria-disabled={!chatSelectable}
                        disabled={!chatSelectable}
                        title={advisory || stringValue(item.description) || item.id}
                        onClick={() => { if (chatSelectable) selectModel(item) }}
                        className={`group/model flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${chatSelectable ? 'hover:bg-white/[0.045]' : 'cursor-not-allowed opacity-70'}`}
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-slate-400">
                          <BrainCircuit className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-xs font-medium text-slate-200 group-hover/model:text-white">{modelLabel(item)}</span>
                            {active && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-slate-400">{item.id}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {!chatSelectable && <span className="rounded bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-100">Discovery only</span>}
                            {item.is_free === true && <span className="rounded bg-emerald-300/8 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-200">Free</span>}
                            {stringArray(item.configured_roles).slice(0, 3).map((role) => <span key={role} className="rounded bg-cyan-300/7 px-1.5 py-0.5 text-[9px] text-cyan-200/80">{role}</span>)}
                            {context && <span className="rounded bg-white/[0.035] px-1.5 py-0.5 text-[9px] text-slate-400">{context}</span>}
                            {stringArray(item.output_modalities).slice(0, 3).map((mode) => <span key={mode} className="rounded bg-violet-300/7 px-1.5 py-0.5 text-[9px] text-violet-100/75">{mode}</span>)}
                          </div>
                          {advisory && (
                            <p className="mt-1.5 text-[10px] leading-4 text-amber-100/75">{advisory}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}

            {grouped.length === 0 && (
              <div className="px-4 py-10 text-center text-xs text-slate-400">No matching models found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
