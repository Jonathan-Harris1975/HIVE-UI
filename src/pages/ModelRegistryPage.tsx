import {
  AlertTriangle,
  Check,
  Cpu,
  LoaderCircle,
  Plus,
  Radio,
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
  MODEL_REGISTRY_CONFIDENCE_LEVELS,
  type ModelRegistryCategoryResponse,
  type ModelRegistryConfidence,
  type ModelRegistryEntry,
  type ModelRegistryMutationResponse,
  type ProviderModel,
  type ProviderModelsResponse,
  type ProvidersHealthResponse,
  type ProvidersResponse,
} from '../types/api'

const CONFIDENCE_LABELS: Record<ModelRegistryConfidence, string> = {
  measured: 'Measured',
  heuristic: 'Heuristic',
  unverified: 'Unverified',
}

const CONFIDENCE_TONE: Record<ModelRegistryConfidence, string> = {
  measured: 'border-emerald-300/25 bg-emerald-300/8 text-emerald-200',
  heuristic: 'border-amber-300/25 bg-amber-300/8 text-amber-200',
  unverified: 'border-white/10 bg-white/[0.04] text-slate-400',
}

function formatLatency(value?: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null
  return `${Math.round(value)}ms`
}

function formatCost(value?: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null
  return `$${value.toFixed(4)}/1k tok`
}

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
  benchmark_score: string
  confidence: ModelRegistryConfidence
  latency_ms: string
  cost_per_1k_tokens: string
}

const EMPTY_DRAFT: RegisterDraft = {
  model_id: '',
  score: '0.8',
  provider: '',
  notes: '',
  benchmark_score: '',
  confidence: 'unverified',
  latency_ms: '',
  cost_per_1k_tokens: '',
}

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

  const [providerNames, setProviderNames] = useState<string[]>([])
  const [providerHealth, setProviderHealth] = useState<Record<string, { ok: boolean; latency_ms: number | null; error: string | null }>>({})
  const [providersLoading, setProvidersLoading] = useState(true)
  const [providersError, setProvidersError] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([])
  const [providerModelsLoading, setProviderModelsLoading] = useState(false)

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

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true)
    setProvidersError(null)
    try {
      const [providersResponse, healthResponse] = await Promise.all([
        apiFetch<ProvidersResponse>('/v1/providers'),
        apiFetch<ProvidersHealthResponse>('/v1/providers/health').catch(() => null),
      ])
      setProviderNames(providersResponse.providers ?? [])
      const healthByName: Record<string, { ok: boolean; latency_ms: number | null; error: string | null }> = {}
      for (const entry of healthResponse?.providers ?? []) {
        healthByName[entry.provider] = { ok: entry.ok, latency_ms: entry.latency_ms, error: entry.error }
      }
      setProviderHealth(healthByName)
      setSelectedProvider((current) => current ?? providersResponse.providers?.[0] ?? null)
    } catch (caught) {
      setProvidersError(caught instanceof Error ? caught.message : 'Providers could not be loaded.')
      setProviderNames([])
    } finally {
      setProvidersLoading(false)
    }
  }, [])

  const loadProviderModels = useCallback(async (providerName: string) => {
    setProviderModelsLoading(true)
    setProvidersError(null)
    try {
      const response = await apiFetch<ProviderModelsResponse>(
        `/v1/providers/${encodeURIComponent(providerName)}/models`,
      )
      setProviderModels(response.models ?? [])
    } catch (caught) {
      setProvidersError(caught instanceof Error ? caught.message : `Models for ${providerName} could not be loaded.`)
      setProviderModels([])
    } finally {
      setProviderModelsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  useEffect(() => {
    if (selectedProvider) void loadProviderModels(selectedProvider)
    else setProviderModels([])
  }, [selectedProvider, loadProviderModels])

  function useCatalogueModel(model: ProviderModel, providerName: string) {
    setDraft((current) => ({
      ...current,
      model_id: model.model_id,
      provider: providerName,
      cost_per_1k_tokens: model.pricing_completion != null ? String(model.pricing_completion) : current.cost_per_1k_tokens,
      notes: model.name && model.name !== model.model_id ? model.name : current.notes,
    }))
    setNotice(`Loaded ${model.model_id} from ${providerName} into the registration form below — set a score and confirm.`)
  }

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
    // Optional context fields - empty string means "not provided", not zero.
    const benchmarkScore = draft.benchmark_score.trim() ? Number.parseFloat(draft.benchmark_score) : null
    const latencyMs = draft.latency_ms.trim() ? Number.parseFloat(draft.latency_ms) : null
    const costPer1k = draft.cost_per_1k_tokens.trim() ? Number.parseFloat(draft.cost_per_1k_tokens) : null
    if (
      (benchmarkScore != null && Number.isNaN(benchmarkScore)) ||
      (latencyMs != null && Number.isNaN(latencyMs)) ||
      (costPer1k != null && Number.isNaN(costPer1k))
    ) {
      setError('Benchmark score, latency and cost must be numbers.')
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
            benchmark_score: benchmarkScore,
            confidence: draft.confidence,
            latency_ms: latencyMs,
            cost_per_1k_tokens: costPer1k,
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
        { label: 'Benchmark score', value: model.benchmark_score != null ? String(model.benchmark_score) : 'Not recorded' },
        { label: 'Confidence', value: CONFIDENCE_LABELS[model.confidence] ?? model.confidence },
        { label: 'Latency', value: formatLatency(model.latency_ms) ?? 'Not recorded' },
        { label: 'Cost', value: formatCost(model.cost_per_1k_tokens) ?? 'Not recorded' },
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
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-medium ${CONFIDENCE_TONE[model.confidence]}`}
                        >
                          {CONFIDENCE_LABELS[model.confidence] ?? model.confidence}
                        </span>
                        {model.benchmark_score != null && (
                          <span className="text-[11px] text-slate-500">Benchmark {model.benchmark_score.toFixed(1)}</span>
                        )}
                        {formatLatency(model.latency_ms) && (
                          <span className="text-[11px] text-slate-500">{formatLatency(model.latency_ms)}</span>
                        )}
                        {formatCost(model.cost_per_1k_tokens) && (
                          <span className="text-[11px] text-slate-500">{formatCost(model.cost_per_1k_tokens)}</span>
                        )}
                      </div>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold text-slate-100">Provider catalogue</h3>
            </div>
            <button
              type="button"
              onClick={() => void loadProviders()}
              className="flex h-9 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 hover:bg-white/[0.07]"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Live models, pricing and capabilities from configured OpenRouter-compatible providers. Pick a model to
            preload it into the registration form below.
          </p>

          {providersError && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/8 px-3 py-2 text-xs text-rose-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {providersError}
            </div>
          )}

          {providersLoading ? (
            <div className="mt-4 flex items-center gap-2 py-4 text-sm text-slate-400">
              <LoaderCircle className="h-4 w-4 animate-spin text-cyan-300" /> Discovering providers…
            </div>
          ) : providerNames.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={<Radio className="h-5 w-5" />}
                title="No providers configured"
                body="Set an OpenRouter API key or add OpenRouter-compatible providers to see live model catalogues here."
              />
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {providerNames.map((name) => {
                  const health = providerHealth[name]
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedProvider(name)}
                      className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${
                        name === selectedProvider
                          ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
                          : 'border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${health == null ? 'bg-slate-500' : health.ok ? 'bg-emerald-300' : 'bg-rose-400'}`} />
                      {name}
                      {health?.latency_ms != null && <span className="text-[10px] text-slate-500">{Math.round(health.latency_ms)}ms</span>}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4">
                {providerModelsLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                    <LoaderCircle className="h-4 w-4 animate-spin text-cyan-300" /> Loading models…
                  </div>
                ) : providerModels.length === 0 ? (
                  <p className="py-2 text-xs text-slate-500">No models returned for this provider.</p>
                ) : (
                  <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                    {providerModels.map((model) => (
                      <li key={model.model_id}>
                        <button
                          type="button"
                          onClick={() => selectedProvider && useCatalogueModel(model, selectedProvider)}
                          className="flex w-full flex-col gap-1 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.05] sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-slate-100">{model.model_id}</span>
                            <span className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-500">
                              {model.context_length != null && <span>{model.context_length.toLocaleString()} ctx</span>}
                              {model.pricing_completion != null && <span>{formatCost(model.pricing_completion)}</span>}
                              {model.supports_tools && <span>tools</span>}
                              {model.supports_structured_output && <span>structured output</span>}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-cyan-300">Use in registration form</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
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
            <label>
              <span className="mb-1 block text-xs text-slate-400">Benchmark score (0–100, optional)</span>
              <input
                value={draft.benchmark_score}
                onChange={(event) => setDraft((current) => ({ ...current, benchmark_score: event.target.value }))}
                inputMode="decimal"
                placeholder="e.g. 82.5"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-slate-400">Confidence</span>
              <select
                value={draft.confidence}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, confidence: event.target.value as ModelRegistryConfidence }))
                }
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/30"
              >
                {MODEL_REGISTRY_CONFIDENCE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {CONFIDENCE_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-slate-400">Latency, ms (optional)</span>
              <input
                value={draft.latency_ms}
                onChange={(event) => setDraft((current) => ({ ...current, latency_ms: event.target.value }))}
                inputMode="decimal"
                placeholder="e.g. 420"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-slate-400">Cost per 1k tokens, USD (optional)</span>
              <input
                value={draft.cost_per_1k_tokens}
                onChange={(event) => setDraft((current) => ({ ...current, cost_per_1k_tokens: event.target.value }))}
                inputMode="decimal"
                placeholder="e.g. 0.015"
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
