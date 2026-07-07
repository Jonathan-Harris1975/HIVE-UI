import {
  AlertTriangle,
  Check,
  Cpu,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import {
  MODEL_REGISTRY_CATEGORIES,
  type ModelRegistryCategoryResponse,
  type ModelRegistryEntry,
  type ModelRegistryMutationResponse,
} from '../types/api'

const CATEGORY_LABELS: Record<string, string> = {
  coding: 'Coding',
  reasoning: 'Reasoning',
  planning: 'Planning',
  vision: 'Vision',
  research: 'Research',
  fast: 'Fast',
  cheap: 'Cheap',
  creative: 'Creative',
  long_context: 'Long context',
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatRegisteredAt(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return 'Unknown'
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

interface RegisterDraft {
  model_id: string
  score: string
  provider: string
  notes: string
}

const EMPTY_DRAFT: RegisterDraft = { model_id: '', score: '0.8', provider: '', notes: '' }

export function ModelRegistryPage() {
  const { setPayload, setOpen } = useInspector()
  const [category, setCategory] = useState<string>(MODEL_REGISTRY_CATEGORIES[0])
  const [models, setModels] = useState<ModelRegistryEntry[]>([])
  const [defaultModel, setDefaultModel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [draft, setDraft] = useState<RegisterDraft>(EMPTY_DRAFT)
  const [registering, setRegistering] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const loadCategory = useCallback(async (targetCategory: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<ModelRegistryCategoryResponse>(
        `/v1/model-registry/${encodeURIComponent(targetCategory)}`,
      )
      setModels(response.models ?? [])
      setDefaultModel(response.default_model ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Model Registry could not be loaded.')
      setModels([])
      setDefaultModel(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCategory(category)
    setNotice(null)
    setError(null)
  }, [category, loadCategory])

  async function registerModel(event: FormEvent) {
    event.preventDefault()
    const modelId = draft.model_id.trim()
    if (!modelId) {
      setError('A model id is required.')
      return
    }
    const score = Number.parseFloat(draft.score)
    if (Number.isNaN(score)) {
      setError('Score must be a number.')
      return
    }
    setRegistering(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<ModelRegistryMutationResponse>(
        `/v1/model-registry/${encodeURIComponent(category)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            model_id: modelId,
            score,
            provider: draft.provider.trim() || null,
            notes: draft.notes.trim() || null,
          }),
        },
      )
      await loadCategory(category)
      setDraft(EMPTY_DRAFT)
      setNotice(
        response.persisted
          ? `${modelId} registered and persisted (survives a restart).`
          : `${modelId} registered for this session only — D1 is not configured, so it will not survive a restart.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Model could not be registered.')
    } finally {
      setRegistering(false)
    }
  }

  async function removeModel(modelId: string) {
    setRemoving(modelId)
    setError(null)
    setNotice(null)
    try {
      await apiFetch<ModelRegistryMutationResponse>(
        `/v1/model-registry/${encodeURIComponent(category)}/${encodeURIComponent(modelId)}`,
        { method: 'DELETE' },
      )
      await loadCategory(category)
      setNotice(`${modelId} removed from ${categoryLabel(category)}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${modelId} could not be removed.`)
    } finally {
      setRemoving(null)
    }
  }

  function inspectModel(model: ModelRegistryEntry) {
    setPayload({
      eyebrow: 'Model Registry',
      title: model.model_id,
      description: `Ranked model in the ${categoryLabel(category)} category, mirrored into D1 so it survives a restart.`,
      rows: [
        { label: 'Category', value: category },
        { label: 'Score', value: String(model.score) },
        { label: 'Provider', value: model.provider ?? 'Unspecified' },
        { label: 'Registered', value: formatRegisteredAt(model.registered_at) },
      ],
      json: model,
    })
    setOpen(true)
  }

  const rankedModels = useMemo(() => [...models].sort((a, b) => b.score - a.score), [models])

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Model registry</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Ranked models per task category</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                The highest-scored model in a category becomes its default for routing. Registrations are mirrored
                into the HIVE D1 metadata store so rankings survive a process restart.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadCategory(category)}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 hover:bg-white/[0.07]"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-white/8 pt-5">
            {MODEL_REGISTRY_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`h-9 rounded-xl border px-3 text-xs font-medium transition ${
                  item === category
                    ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
                    : 'border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                }`}
              >
                {categoryLabel(item)}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-300/20 bg-rose-300/8 px-4 py-3 text-xs text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {notice && !error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-xs text-emerald-200">
            <Check className="h-4 w-4 shrink-0" /> {notice}
          </div>
        )}

        <section className="mt-4 rounded-3xl border border-white/8 bg-[#0a192d]/60 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{categoryLabel(category)} models</h3>
            {defaultModel && <StatusBadge status="ready" label={`Default: ${defaultModel}`} />}
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
                <LoaderCircle className="h-4 w-4 animate-spin text-cyan-300" /> Loading registry…
              </div>
            ) : rankedModels.length === 0 ? (
              <EmptyState
                icon={<Cpu className="h-5 w-5" />}
                title="No models registered"
                body={`Register a model below to set it as a ranked candidate for the ${categoryLabel(category)} category.`}
              />
            ) : (
              <ul className="space-y-2">
                {rankedModels.map((model, index) => (
                  <li
                    key={model.model_id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <button type="button" onClick={() => inspectModel(model)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-semibold text-slate-300">
                          {index + 1}
                        </span>
                        <span className="truncate text-sm font-medium text-slate-100">{model.model_id}</span>
                        {index === 0 && <StatusBadge status="ready" label="Default" compact />}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        Score {model.score.toFixed(2)}
                        {model.provider ? ` · ${model.provider}` : ''} · Registered {formatRegisteredAt(model.registered_at)}
                      </p>
                      {model.notes && <p className="mt-1 truncate text-xs text-slate-500">{model.notes}</p>}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeModel(model.model_id)}
                      disabled={removing === model.model_id}
                      className="flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/8 px-3 text-xs font-medium text-rose-200 hover:bg-rose-300/12 disabled:opacity-50"
                    >
                      {removing === model.model_id ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-white/8 bg-[#0a192d]/60 p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-slate-100">Register a model in {categoryLabel(category)}</h3>
          </div>
          <form onSubmit={registerModel} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-400">Model id</span>
              <input
                value={draft.model_id}
                onChange={(event) => setDraft((current) => ({ ...current, model_id: event.target.value }))}
                placeholder="e.g. anthropic/claude-sonnet-5"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-slate-400">Score (0–1000, higher ranks first)</span>
              <input
                value={draft.score}
                onChange={(event) => setDraft((current) => ({ ...current, score: event.target.value }))}
                inputMode="decimal"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/30"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-slate-400">Provider (optional)</span>
              <input
                value={draft.provider}
                onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value }))}
                placeholder="e.g. openrouter"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-400">Notes (optional)</span>
              <input
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Why this model/score"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
            </label>
            <button
              type="submit"
              disabled={registering}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-60 sm:col-span-2 sm:w-fit"
            >
              {registering ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Register model
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
