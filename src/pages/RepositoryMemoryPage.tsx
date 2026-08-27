import {
  AlertTriangle,
  BookOpen,
  Check,
  Clock,
  History,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { useInspector } from '../context/InspectorContext'
import { useRepositoryCatalog } from '../hooks/useRepositoryCatalog'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import {
  REPOSITORY_MEMORY_HISTORY_FIELDS,
  REPOSITORY_MEMORY_SCALAR_FIELDS,
  type RepositoryMemoryDiagnosticsResponse,
  type RepositoryMemoryFieldResponse,
  type RepositoryMemoryResponse,
  type RepositoryMemorySearchResponse,
} from '../types/api'

const FIELD_LABELS: Record<string, string> = {
  project_manifest: 'Project manifest',
  project_dna: 'Project DNA',
  architecture_summary: 'Architecture summary',
  coding_standards: 'Coding standards',
  build_profile: 'Build profile',
  deployment_profile: 'Deployment profile',
  environment_schema: 'Environment schema',
  known_issues: 'Known issues',
  learned_patterns: 'Learned patterns',
  previous_patches: 'Previous patches',
  optimisation_history: 'Optimisation history',
  qa_history: 'QA history',
  repository_council_history: 'Repository Council history',
  repository_intelligence_history: 'Repository Intelligence reports',
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function isBlank(content: unknown): boolean {
  if (content == null) return true
  if (Array.isArray(content)) return content.length === 0
  if (typeof content === 'string') return content.trim().length === 0
  if (typeof content === 'object') return Object.keys(content as Record<string, unknown>).length === 0
  return false
}

function pretty(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

function historyItems(content: unknown): Record<string, unknown>[] {
  if (!Array.isArray(content)) return []
  return content.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
}

function summariseEntry(entry: Record<string, unknown>): { title: string; detail: string; when?: string } {
  const title = String(entry.title || entry.summary || entry.name || entry.issue || entry.pattern || 'Entry')
  const detail = String(entry.detail || entry.description || entry.notes || entry.note || '')
  const when = entry.occurred_at || entry.timestamp || entry.date
  return { title, detail, when: when == null ? undefined : String(when) }
}

interface RepositoryMemoryPageProps {
  embedded?: boolean
  repositoryId?: string
}

export function RepositoryMemoryPage({ embedded = false, repositoryId: controlledRepositoryId }: RepositoryMemoryPageProps = {}) {
  const { setPayload, setOpen } = useInspector()
  const catalog = useRepositoryCatalog()
  const [searchParams, setSearchParams] = useSearchParams()
  const [repositoryId, setRepositoryId] = useState(controlledRepositoryId ?? searchParams.get('repo') ?? '')
  const [repoInput, setRepoInput] = useState(repositoryId)
  const activeRepositoryRef = useRef(controlledRepositoryId ?? repositoryId)
  const selectRepository = useCallback((nextRepositoryId: string) => {
    activeRepositoryRef.current = nextRepositoryId
    setRepositoryId(nextRepositoryId)
  }, [])
  const [memory, setMemory] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editingField, setEditingField] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [savingField, setSavingField] = useState<string | null>(null)

  const [appendField, setAppendField] = useState<string | null>(null)
  const [appendDraft, setAppendDraft] = useState('')
  const [appending, setAppending] = useState(false)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<RepositoryMemorySearchResponse | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [diagnostics, setDiagnostics] = useState<RepositoryMemoryDiagnosticsResponse | null>(null)

  useEffect(() => {
    if (controlledRepositoryId) {
      if (controlledRepositoryId !== repositoryId) {
        selectRepository(controlledRepositoryId)
        setRepoInput(controlledRepositoryId)
      }
      return
    }
    if (!embedded) return
    const requested = searchParams.get('repo') ?? ''
    if (requested && requested !== repositoryId) {
      selectRepository(requested)
      setRepoInput(requested)
    }
  }, [controlledRepositoryId, embedded, repositoryId, searchParams, selectRepository])

  useEffect(() => {
    if (catalog.loading || catalog.repositories.length === 0) return
    if (repositoryId && catalog.repositories.some((repo) => repo.repository_id === repositoryId)) return
    const preferred = catalog.repositories.find((repo) => repo.repository_id === 'HIVE') ?? catalog.repositories[0]
    selectRepository(preferred.repository_id)
    setRepoInput(preferred.repository_id)
  }, [catalog.loading, catalog.repositories, repositoryId, selectRepository])

  const loadMemory = useCallback(async (repo: string) => {
    if (activeRepositoryRef.current === repo) {
      setLoading(true)
      setError(null)
    }
    try {
      const response = await apiFetch<RepositoryMemoryResponse>(`/v1/repositories/${encodeURIComponent(repo)}/memory`)
      if (activeRepositoryRef.current !== repo) return
      if (response.repository_id !== repo) throw new Error(`Repository Memory returned data for ${response.repository_id}, not ${repo}.`)
      setMemory(response.memory ?? {})
    } catch (caught) {
      if (activeRepositoryRef.current !== repo) return
      setError(caught instanceof Error ? caught.message : 'Repository Memory could not be loaded.')
      setMemory({})
    } finally {
      if (activeRepositoryRef.current === repo) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!repositoryId || catalog.loading) return
    if (!catalog.repositories.some((repo) => repo.repository_id === repositoryId)) return
    void loadMemory(repositoryId)
    setSearchResults(null)
    setSearchError(null)
    setQuery('')
  }, [repositoryId, catalog.loading, catalog.repositories, loadMemory])

  useEffect(() => {
    if (!repositoryId || controlledRepositoryId) return
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('repo', repositoryId)
        return next
      },
      { replace: true },
    )
  }, [controlledRepositoryId, repositoryId, setSearchParams])

  useEffect(() => {
    apiFetch<RepositoryMemoryDiagnosticsResponse>('/v1/repository-memory/diagnostics')
      .then(setDiagnostics)
      .catch(() => setDiagnostics(null))
  }, [])

  function switchRepository(event: FormEvent) {
    event.preventDefault()
    const next = repoInput.trim()
    if (next) selectRepository(next)
  }

  function startEdit(field: string) {
    setEditingField(field)
    setDraftValue(pretty(memory[field]))
    setAppendField(null)
  }

  function cancelEdit() {
    setEditingField(null)
    setDraftValue('')
  }

  async function saveField(field: string) {
    const repo = repositoryId
    setSavingField(field)
    setError(null)
    setNotice(null)
    let content: unknown = draftValue
    const trimmed = draftValue.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
      try {
        content = JSON.parse(trimmed)
      } catch {
        // Fall back to raw string content if it isn't valid JSON.
        content = draftValue
      }
    } else if (trimmed.length === 0) {
      content = null
    }
    try {
      const response = await apiFetch<RepositoryMemoryFieldResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/memory/${encodeURIComponent(field)}`,
        { method: 'PUT', body: JSON.stringify({ content }) },
      )
      if (activeRepositoryRef.current !== repo) return
      if (response.repository_id !== repo) throw new Error(`Repository Memory saved data for ${response.repository_id}, not ${repo}.`)
      setMemory((current) => ({ ...current, [field]: response.content }))
      setEditingField(null)
      setNotice(`${fieldLabel(field)} saved for ${repo}.`)
    } catch (caught) {
      if (activeRepositoryRef.current === repo) setError(caught instanceof Error ? caught.message : `${fieldLabel(field)} could not be saved.`)
    } finally {
      if (activeRepositoryRef.current === repo) setSavingField(null)
    }
  }

  function startAppend(field: string) {
    setAppendField(field)
    setAppendDraft('{\n  "summary": ""\n}')
    setEditingField(null)
  }

  async function submitAppend(field: string) {
    const repo = repositoryId
    setAppending(true)
    setError(null)
    setNotice(null)
    let entry: Record<string, unknown>
    try {
      const parsed = JSON.parse(appendDraft)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Entry must be a JSON object.')
      }
      entry = parsed as Record<string, unknown>
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Entry must be valid JSON.')
      setAppending(false)
      return
    }
    if (!('occurred_at' in entry)) entry.occurred_at = new Date().toISOString()
    try {
      await apiFetch(
        `/v1/repositories/${encodeURIComponent(repo)}/memory/${encodeURIComponent(field)}/append`,
        { method: 'POST', body: JSON.stringify({ entry }) },
      )
      if (activeRepositoryRef.current !== repo) return
      await loadMemory(repo)
      if (activeRepositoryRef.current !== repo) return
      setAppendField(null)
      setNotice(`Entry appended to ${fieldLabel(field)} for ${repo}.`)
    } catch (caught) {
      if (activeRepositoryRef.current === repo) setError(caught instanceof Error ? caught.message : 'Entry could not be appended.')
    } finally {
      if (activeRepositoryRef.current === repo) setAppending(false)
    }
  }

  async function runSearch(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return
    const repo = repositoryId
    const searchQuery = query.trim()
    setSearching(true)
    setSearchError(null)
    try {
      const response = await apiFetch<RepositoryMemorySearchResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/memory-search?q=${encodeURIComponent(searchQuery)}&limit=20`,
      )
      if (activeRepositoryRef.current !== repo) return
      setSearchResults(response)
    } catch (caught) {
      if (activeRepositoryRef.current !== repo) return
      setSearchError(caught instanceof Error ? caught.message : 'Memory search failed.')
      setSearchResults(null)
    } finally {
      if (activeRepositoryRef.current === repo) setSearching(false)
    }
  }

  function inspectField(field: string) {
    setPayload({
      eyebrow: 'Repository Memory',
      title: fieldLabel(field),
      description: `Field on ${repositoryId}, persisted in D1 (\`repository_memory\` lane).`,
      rows: [{ label: 'Repository', value: repositoryId }, { label: 'Field', value: field }],
      json: memory[field] ?? null,
    })
    setOpen(true)
  }

  const scalarCount = useMemo(
    () => REPOSITORY_MEMORY_SCALAR_FIELDS.filter((field) => !isBlank(memory[field])).length,
    [memory],
  )
  const historyCount = useMemo(
    () => REPOSITORY_MEMORY_HISTORY_FIELDS.reduce((sum, field) => sum + historyItems(memory[field]).length, 0),
    [memory],
  )
  const persistenceDiagnostics = diagnostics?.persistence
  const aiDiagnostics = diagnostics?.ai_search
  const persistenceReady = persistenceDiagnostics?.ok === true && persistenceDiagnostics?.schema_ready === true
  const selectedRepository = catalog.repositories.find((repo) => repo.repository_id === repositoryId)
  const repositoryUnavailable = Boolean(repositoryId) && !catalog.loading && !selectedRepository
  const memoryWritable = Boolean(selectedRepository && persistenceReady)

  return (
    <div className={embedded ? "mt-6 min-w-0" : "h-full overflow-x-hidden overflow-y-auto p-3 sm:p-6 lg:p-8"}>
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-hive-panel/75 p-4 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Repository memory</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Persistent, queryable repository knowledge</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Structured facts and history that outlive a repository's temporary working copy, stored directly in
                the HIVE D1 metadata store.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadMemory(repositoryId)}
              disabled={!selectedRepository || loading}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 hover:bg-white/[0.07]"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>

          {!embedded && (
            <>
              <form onSubmit={switchRepository} className="mt-6 grid min-w-0 gap-2 border-t border-white/8 pt-5 sm:grid-cols-[minmax(0,1fr)_auto]">
                <select
                  value={repoInput}
                  aria-label="Choose registered repository"
                  onChange={(event) => setRepoInput(event.target.value)}
                  className="h-10 w-full min-w-0 max-w-full rounded-xl border border-white/8 bg-hive-surface px-3 text-sm text-slate-300 outline-none"
                >
                  <option value="">{catalog.loading ? 'Loading repositories…' : 'Choose a registered repository…'}</option>
                  {catalog.repositories.map((repo) => (
                    <option key={repo.repository_id} value={repo.repository_id}>{repo.repository_id} · {repo.source_filename}</option>
                  ))}
                </select>
                <button type="submit" disabled={!repoInput} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-hive-accent-deep disabled:opacity-50">
                  Load
                </button>
              </form>

              {catalog.error && <div role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-xs text-rose-200">{catalog.error}</div>}
              {!catalog.loading && catalog.repositories.length === 0 && (
                <div role="alert" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-xs text-amber-100">
                  No repository snapshots are registered. Upload the governed repositories on Overview before using Memory.
                </div>
              )}
              {repositoryUnavailable && (
                <div role="alert" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-xs text-amber-100">
                  {repositoryId} is not registered in HIVE. Choose a registered repository or upload its ZIP on Overview.
                </div>
              )}
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 px-2.5 py-1">Repository: <span className="text-slate-200">{repositoryId}</span></span>
            <span className="rounded-full border border-cyan-300/15 bg-cyan-300/7 px-2.5 py-1 text-cyan-100">{scalarCount}/{REPOSITORY_MEMORY_SCALAR_FIELDS.length} scalar fields set</span>
            <span className="rounded-full border border-emerald-300/15 bg-emerald-300/7 px-2.5 py-1 text-emerald-100">{historyCount} history entries</span>
            {persistenceDiagnostics && (
              <>
                <StatusBadge status={persistenceReady ? 'ready' : 'not_ready'} compact />
                <span className={`rounded-full border px-2.5 py-1 ${
                  persistenceReady
                    ? 'border-emerald-300/15 bg-emerald-300/7 text-emerald-100'
                    : 'border-rose-300/20 bg-rose-300/8 text-rose-200'
                }`}>
                  D1 Memory: {persistenceReady ? 'ready' : 'unavailable'}
                </span>
              </>
            )}
            {aiDiagnostics && (
              <>
                <StatusBadge status={aiDiagnostics.configured ? aiDiagnostics.status || 'ok' : 'not_configured'} compact />
                {typeof aiDiagnostics.instance_count === 'number' && (
                  <span className="rounded-full border border-cyan-300/15 bg-cyan-300/7 px-2.5 py-1 text-cyan-100">
                    AI Search: {aiDiagnostics.active_instance_count ?? aiDiagnostics.instance_count}/{aiDiagnostics.instance_count} active
                  </span>
                )}
                {(aiDiagnostics.paused_instance_count ?? 0) > 0 && (
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2.5 py-1 text-amber-100">
                    {aiDiagnostics.paused_instance_count} paused
                  </span>
                )}
                {(aiDiagnostics.indexing_error_count ?? 0) > 0 && (
                  <span className="rounded-full border border-rose-300/20 bg-rose-300/8 px-2.5 py-1 text-rose-200">
                    {aiDiagnostics.indexing_error_count} indexing error{aiDiagnostics.indexing_error_count === 1 ? '' : 's'}
                  </span>
                )}
                {(aiDiagnostics.stats_failure_count ?? 0) > 0 && (
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2.5 py-1 text-amber-100">
                    {aiDiagnostics.stats_failure_count} stats unverified
                  </span>
                )}
              </>
            )}
          </div>

          {persistenceDiagnostics && !persistenceReady && (
            <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-xs leading-5 text-rose-200">
              Repository Memory persistence is not ready. HIVE could reach neither a usable D1 metadata schema nor a
              healthy persistence path. Saves and searches are blocked until D1 is restored.
            </div>
          )}

          <form onSubmit={runSearch} className="mt-5 flex gap-2 border-t border-white/8 pt-5">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this repository's memory (e.g. a past incident, a pattern, a patch)"
                className="h-10 w-full rounded-xl border border-white/8 bg-hive-surface pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-400 focus:border-cyan-300/30"
              />
            </label>
            <button type="submit" disabled={!query.trim() || searching || !memoryWritable} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs text-slate-300 hover:bg-white/[0.07] disabled:opacity-50">
              {searching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Search
            </button>
          </form>

          {searchError && <p className="mt-3 text-xs text-rose-300">{searchError}</p>}
          {searchResults && (
            <div className="mt-3 max-h-56 max-w-full space-y-2 overflow-auto rounded-xl border border-white/8 bg-hive-surface/60 p-3">
              {(searchResults.items ?? []).length === 0 ? (
                <p className="text-xs text-slate-400">No matches for that query in {repositoryId}.</p>
              ) : (
                (searchResults.items ?? []).map((item, index) => (
                  <div key={item.id || `${item.source_type}-${index}`} className="rounded-lg border border-white/6 bg-white/[0.025] px-3 py-2 text-xs">
                    <p className="font-medium text-slate-100">{item.title || fieldLabel(String(item.source_type || 'result'))}</p>
                    <p className="mt-1 text-slate-400">{item.source_type} · {item.updated_at ? formatDate(item.updated_at) : 'undated'}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

        {loading ? (
          <div className="mt-8 flex items-center justify-center py-16 text-slate-400"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading Repository Memory</div>
        ) : (
          <>
            <section className="mt-6">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"><BookOpen className="h-4 w-4" /> Scalar fields</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {REPOSITORY_MEMORY_SCALAR_FIELDS.map((field) => {
                  const content = memory[field]
                  const blank = isBlank(content)
                  return (
                    <article key={field} className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => inspectField(field)} className="text-left">
                          <h4 className="text-sm font-semibold text-white">{fieldLabel(field)}</h4>
                        </button>
                        <StatusBadge status={blank ? 'unknown' : 'active'} label={blank ? 'Not populated' : 'Populated'} compact />
                      </div>
                      {editingField === field ? (
                        <div className="mt-3">
                          <textarea
                            value={draftValue}
                            aria-label={`Edit ${fieldLabel(field)}`}
                            onChange={(event) => setDraftValue(event.target.value)}
                            rows={6}
                            placeholder="Plain text or JSON"
                            className="w-full resize-none rounded-xl border border-white/8 bg-hive-surface px-3 py-3 font-mono text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={cancelEdit} className="h-8 rounded-lg border border-white/8 px-3 text-xs text-slate-300">Cancel</button>
                            <button
                              type="button"
                              onClick={() => void saveField(field)}
                              disabled={savingField === field || !memoryWritable}
                              className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-50"
                            >
                              {savingField === field ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="mt-2 line-clamp-4 min-h-[40px] whitespace-pre-wrap font-mono text-xs leading-5 text-slate-400">
                            {blank ? 'No repository profile has populated this field yet.' : pretty(content)}
                          </p>
                          <button type="button" onClick={() => startEdit(field)} disabled={!memoryWritable} className="mt-3 h-8 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40">
                            {blank ? 'Set field' : 'Edit'}
                          </button>
                        </>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="mt-8">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"><History className="h-4 w-4" /> History fields</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {REPOSITORY_MEMORY_HISTORY_FIELDS.map((field) => {
                  const items = historyItems(memory[field])
                  return (
                    <article key={field} className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => inspectField(field)} className="text-left">
                          <h4 className="text-sm font-semibold text-white">{fieldLabel(field)}</h4>
                        </button>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">{items.length}</span>
                      </div>

                      {items.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-500">No entries recorded yet.</p>
                      ) : (
                        <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                          {items.slice(-5).reverse().map((entry, index) => {
                            const { title, detail, when } = summariseEntry(entry)
                            return (
                              <div key={index} className="rounded-lg border border-white/6 bg-white/[0.025] px-3 py-2">
                                <p className="text-xs font-medium text-slate-100">{title}</p>
                                {detail && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{detail}</p>}
                                {when && (
                                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3 w-3" /> {formatDate(when)}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {appendField === field ? (
                        <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
                          <label className="text-xs font-medium text-slate-300">New entry (JSON object)</label>
                          <textarea
                            value={appendDraft}
                            aria-label={`New ${fieldLabel(field)} entry`}
                            onChange={(event) => setAppendDraft(event.target.value)}
                            rows={4}
                            className="mt-1.5 w-full resize-none rounded-lg border border-white/8 bg-hive-surface px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-300/30"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setAppendField(null)} className="h-8 rounded-lg border border-white/8 px-3 text-xs text-slate-300">Cancel</button>
                            <button
                              type="button"
                              onClick={() => void submitAppend(field)}
                              disabled={appending || !memoryWritable}
                              className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-xs text-emerald-100 disabled:opacity-50"
                            >
                              {appending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Append
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => startAppend(field)} disabled={!memoryWritable} className="mt-3 flex h-8 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40">
                          <Plus className="h-3.5 w-3.5" /> Append entry
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>

            {scalarCount === 0 && historyCount === 0 && (
              <div className="mt-6">
                <EmptyState
                  icon={<AlertTriangle className="h-5 w-5" />}
                  title={`No Repository Memory recorded yet for ${repositoryId}.`}
                  body="A successful repository upload populates the scalar profile and initial QA/Council history automatically. Use Retry setup on Overview when the source snapshot exists; only legacy snapshotless registrations require one re-upload."
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
