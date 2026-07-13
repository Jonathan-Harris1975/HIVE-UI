import {
  AlertTriangle,
  BookOpen,
  Check,
  Clock,
  Database,
  History,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import {
  REPOSITORY_MEMORY_HISTORY_FIELDS,
  REPOSITORY_MEMORY_SCALAR_FIELDS,
  type AiSearchDiagnosticsResponse,
  type RepositoryMemoryFieldResponse,
  type RepositoryMemoryResponse,
  type RepositoryMemorySearchResponse,
} from '../types/api'

const KNOWN_REPOS = ['AIMS', 'HIVE', 'HIVE-UI', 'RAMS', 'Website', 'Shared']

const FIELD_LABELS: Record<string, string> = {
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

export function RepositoryMemoryPage() {
  const { setPayload, setOpen } = useInspector()
  const [searchParams, setSearchParams] = useSearchParams()
  const [repositoryId, setRepositoryId] = useState(searchParams.get('repo') ?? 'HIVE')
  const [repoInput, setRepoInput] = useState(repositoryId)
  const [memory, setMemory] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
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

  const [diagnostics, setDiagnostics] = useState<AiSearchDiagnosticsResponse | null>(null)

  const loadMemory = useCallback(async (repo: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<RepositoryMemoryResponse>(`/v1/repositories/${encodeURIComponent(repo)}/memory`)
      setMemory(response.memory ?? {})
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository Memory could not be loaded.')
      setMemory({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMemory(repositoryId)
    setSearchResults(null)
    setSearchError(null)
    setQuery('')
  }, [repositoryId, loadMemory])

  useEffect(() => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('repo', repositoryId)
        return next
      },
      { replace: true },
    )
  }, [repositoryId, setSearchParams])

  useEffect(() => {
    apiFetch<AiSearchDiagnosticsResponse>('/v1/repository-memory/ai-search/diagnostics')
      .then(setDiagnostics)
      .catch(() => setDiagnostics(null))
  }, [])

  function switchRepository(event: FormEvent) {
    event.preventDefault()
    const next = repoInput.trim()
    if (next) setRepositoryId(next)
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
      await apiFetch<RepositoryMemoryFieldResponse>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/memory/${encodeURIComponent(field)}`,
        { method: 'PUT', body: JSON.stringify({ content }) },
      )
      setMemory((current) => ({ ...current, [field]: content }))
      setEditingField(null)
      setNotice(`${fieldLabel(field)} saved.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${fieldLabel(field)} could not be saved.`)
    } finally {
      setSavingField(null)
    }
  }

  function startAppend(field: string) {
    setAppendField(field)
    setAppendDraft('{\n  "summary": ""\n}')
    setEditingField(null)
  }

  async function submitAppend(field: string) {
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
        `/v1/repositories/${encodeURIComponent(repositoryId)}/memory/${encodeURIComponent(field)}/append`,
        { method: 'POST', body: JSON.stringify({ entry }) },
      )
      await loadMemory(repositoryId)
      setAppendField(null)
      setNotice(`Entry appended to ${fieldLabel(field)}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Entry could not be appended.')
    } finally {
      setAppending(false)
    }
  }

  async function runSearch(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const response = await apiFetch<RepositoryMemorySearchResponse>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/memory-search?q=${encodeURIComponent(query.trim())}&limit=20`,
      )
      setSearchResults(response)
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : 'Memory search failed.')
      setSearchResults(null)
    } finally {
      setSearching(false)
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

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
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
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 hover:bg-white/[0.07]"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>

          <form onSubmit={switchRepository} className="mt-6 grid gap-2 border-t border-white/8 pt-5 sm:grid-cols-[1fr_220px_auto]">
            <label className="relative">
              <Database className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                list="known-repos"
                placeholder="Repository id (e.g. HIVE)"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-400 focus:border-cyan-300/30"
              />
              <datalist id="known-repos">
                {KNOWN_REPOS.map((repo) => (
                  <option key={repo} value={repo} />
                ))}
              </datalist>
            </label>
            <select
              value={KNOWN_REPOS.includes(repoInput) ? repoInput : ''}
              onChange={(event) => event.target.value && setRepoInput(event.target.value)}
              className="h-10 rounded-xl border border-white/8 bg-[#071426] px-3 text-xs text-slate-300 outline-none"
            >
              <option value="">Known repositories…</option>
              {KNOWN_REPOS.map((repo) => (
                <option key={repo} value={repo}>{repo}</option>
              ))}
            </select>
            <button type="submit" className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035]">
              Load
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 px-2.5 py-1">Repository: <span className="text-slate-200">{repositoryId}</span></span>
            <span className="rounded-full border border-cyan-300/15 bg-cyan-300/7 px-2.5 py-1 text-cyan-100">{scalarCount}/{REPOSITORY_MEMORY_SCALAR_FIELDS.length} scalar fields set</span>
            <span className="rounded-full border border-emerald-300/15 bg-emerald-300/7 px-2.5 py-1 text-emerald-100">{historyCount} history entries</span>
            {diagnostics && (
              <StatusBadge status={diagnostics.configured ? diagnostics.status || 'ok' : 'not_configured'} compact />
            )}
          </div>

          <form onSubmit={runSearch} className="mt-5 flex gap-2 border-t border-white/8 pt-5">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this repository's memory (e.g. a past incident, a pattern, a patch)"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-400 focus:border-cyan-300/30"
              />
            </label>
            <button type="submit" disabled={!query.trim() || searching} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs text-slate-300 hover:bg-white/[0.07] disabled:opacity-50">
              {searching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Search
            </button>
          </form>

          {searchError && <p className="mt-3 text-xs text-rose-300">{searchError}</p>}
          {searchResults && (
            <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-white/8 bg-[#071426]/60 p-3">
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

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

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
                    <article key={field} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => inspectField(field)} className="text-left">
                          <h4 className="text-sm font-semibold text-white">{fieldLabel(field)}</h4>
                        </button>
                        <StatusBadge status={blank ? 'not_configured' : 'active'} compact />
                      </div>
                      {editingField === field ? (
                        <div className="mt-3">
                          <textarea
                            value={draftValue}
                            onChange={(event) => setDraftValue(event.target.value)}
                            rows={6}
                            placeholder="Plain text or JSON"
                            className="w-full resize-none rounded-xl border border-white/8 bg-[#071426] px-3 py-3 font-mono text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={cancelEdit} className="h-8 rounded-lg border border-white/8 px-3 text-xs text-slate-300">Cancel</button>
                            <button
                              type="button"
                              onClick={() => void saveField(field)}
                              disabled={savingField === field}
                              className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-50"
                            >
                              {savingField === field ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="mt-2 line-clamp-4 min-h-[40px] whitespace-pre-wrap font-mono text-xs leading-5 text-slate-400">
                            {blank ? 'Not set yet.' : pretty(content)}
                          </p>
                          <button type="button" onClick={() => startEdit(field)} className="mt-3 h-8 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07]">
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
                    <article key={field} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => inspectField(field)} className="text-left">
                          <h4 className="text-sm font-semibold text-white">{fieldLabel(field)}</h4>
                        </button>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400">{items.length}</span>
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
                                {detail && <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{detail}</p>}
                                {when && (
                                  <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><Clock className="h-3 w-3" /> {formatDate(when)}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {appendField === field ? (
                        <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
                          <label className="text-[11px] font-medium text-slate-300">New entry (JSON object)</label>
                          <textarea
                            value={appendDraft}
                            onChange={(event) => setAppendDraft(event.target.value)}
                            rows={4}
                            className="mt-1.5 w-full resize-none rounded-lg border border-white/8 bg-[#071426] px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-300/30"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setAppendField(null)} className="h-8 rounded-lg border border-white/8 px-3 text-xs text-slate-300">Cancel</button>
                            <button
                              type="button"
                              onClick={() => void submitAppend(field)}
                              disabled={appending}
                              className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-xs text-emerald-100 disabled:opacity-50"
                            >
                              {appending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Append
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => startAppend(field)} className="mt-3 flex h-8 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07]">
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
                  body="Set a scalar field or append a history entry above to start building this repository's persistent memory."
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
