import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSearch,
  Gavel,
  History,
  LoaderCircle,
  Plus,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import type {
  ExecutionReviewCreateResponse,
  ExecutionReviewDecisionResponse,
  ExecutionReviewDetailResponse,
  ExecutionReviewListResponse,
  ExecutionReviewSummary,
} from '../types/api'

type StatusFilter = 'open' | 'ready' | 'closed' | 'all'

const DECISIONS = ['approved', 'needs_changes', 'rejected', 'archived'] as const

function riskTone(risk: string | null): string {
  const value = (risk || '').toLowerCase()
  if (value === 'high') return 'text-rose-300'
  if (value === 'medium') return 'text-amber-300'
  return 'text-slate-400'
}

export function ExecutionReviewsPage() {
  const [filter, setFilter] = useState<StatusFilter>('open')
  const [items, setItems] = useState<ExecutionReviewSummary[]>([])
  const [counts, setCounts] = useState({ open: 0, ready: 0, closed: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [safetyNote, setSafetyNote] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [taskInput, setTaskInput] = useState('')
  const [repoInput, setRepoInput] = useState('')
  const [presetInput, setPresetInput] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deciding, setDeciding] = useState<string | null>(null)

  const [auditTrail, setAuditTrail] = useState<Record<string, unknown> | null>(null)
  const [evidencePack, setEvidencePack] = useState<Record<string, unknown> | null>(null)
  const [panelLoading, setPanelLoading] = useState<'audit' | 'evidence' | null>(null)

  const loadList = useCallback(async (status: StatusFilter) => {
    setLoading(true)
    setError(null)
    try {
      const query = status === 'all' ? '' : `?status=${status}`
      const response = await apiFetch<ExecutionReviewListResponse>(`/v1/execution-reviews${query}`)
      if (!response.ok) {
        setError('Execution review storage is not enabled on this deployment (D1 disabled).')
        setItems([])
        return
      }
      setItems(response.items ?? [])
      setCounts({ open: response.open_count, ready: response.ready_count, closed: response.closed_count, total: response.total_count })
      setSafetyNote(response.safety_note)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Execution reviews could not be loaded.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList(filter)
  }, [filter, loadList])

  async function loadDetail(planId: string) {
    setSelectedId(planId)
    setDetail(null)
    setAuditTrail(null)
    setEvidencePack(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const response = await apiFetch<ExecutionReviewDetailResponse>(`/v1/execution-reviews/${encodeURIComponent(planId)}`)
      if (!response.ok) {
        setDetailError(response.error_code === 'execution_plan_not_found' ? 'Plan not found.' : 'Plan could not be loaded.')
        return
      }
      setDetail(response.review)
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Plan could not be loaded.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function createReview(event: FormEvent) {
    event.preventDefault()
    if (!taskInput.trim()) return
    setCreating(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<ExecutionReviewCreateResponse>('/v1/execution-reviews', {
        method: 'POST',
        body: JSON.stringify({
          task: taskInput.trim(),
          repo: repoInput.trim() || null,
          workflow_preset: presetInput.trim() || null,
          dry_run: false,
        }),
      })
      if (!response.ok) {
        setError(response.message || 'Execution review could not be created.')
        return
      }
      setNotice(`Review plan ${response.plan_id} created (pending review).`)
      setTaskInput('')
      setRepoInput('')
      setPresetInput('')
      setShowCreate(false)
      await loadList(filter)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Execution review could not be created.')
    } finally {
      setCreating(false)
    }
  }

  async function submitDecision(decision: string) {
    if (!selectedId) return
    setDeciding(decision)
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<ExecutionReviewDecisionResponse>(
        `/v1/execution-reviews/${encodeURIComponent(selectedId)}/decision`,
        { method: 'POST', body: JSON.stringify({ decision, note: decisionNote.trim() || null }) },
      )
      if (!response.ok) {
        setError(response.error_code === 'invalid_decision' ? `Invalid decision. Allowed: ${response.allowed_decisions?.join(', ')}` : 'Decision could not be recorded.')
        return
      }
      setNotice(`Recorded "${decision.replace(/_/g, ' ')}" for ${selectedId}.`)
      setDecisionNote('')
      setDetail(response.review)
      await loadList(filter)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Decision could not be recorded.')
    } finally {
      setDeciding(null)
    }
  }

  async function loadAuditTrail() {
    if (!selectedId) return
    setPanelLoading('audit')
    try {
      const response = await apiFetch<Record<string, unknown>>(`/v1/execution-reviews/${encodeURIComponent(selectedId)}/audit-trail`)
      setAuditTrail(response)
      setEvidencePack(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Audit trail could not be loaded.')
    } finally {
      setPanelLoading(null)
    }
  }

  async function loadEvidencePack() {
    if (!selectedId) return
    setPanelLoading('evidence')
    try {
      const response = await apiFetch<Record<string, unknown>>(`/v1/execution-reviews/${encodeURIComponent(selectedId)}/evidence-pack`)
      setEvidencePack(response)
      setAuditTrail(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Evidence pack could not be loaded.')
    } finally {
      setPanelLoading(null)
    }
  }

  async function exportPack(format: 'json' | 'markdown') {
    if (!selectedId) return
    try {
      const response = await apiFetch<{ ok: boolean; content?: string; export?: string }>(
        `/v1/execution-reviews/${encodeURIComponent(selectedId)}/export`,
        { method: 'POST', body: JSON.stringify({ format }) },
      )
      const text = typeof response.content === 'string' ? response.content : JSON.stringify(response, null, 2)
      const blob = new Blob([text], { type: format === 'markdown' ? 'text/markdown' : 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${selectedId}-evidence.${format === 'markdown' ? 'md' : 'json'}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export failed.')
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Execution reviews</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Review-gated execution plans</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Every plan requires an explicit approval decision before an allow-listed adapter handoff unlocks.
                Nothing here executes a skill, pushes to a repo, or installs packages on its own.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035]"
            >
              <Plus className="h-4 w-4" /> New review plan
            </button>
          </div>

          {showCreate && (
            <form onSubmit={createReview} className="mt-5 space-y-2 border-t border-white/8 pt-5">
              <textarea
                value={taskInput}
                onChange={(event) => setTaskInput(event.target.value)}
                placeholder="Describe the task this plan covers…"
                rows={3}
                className="w-full resize-none rounded-xl border border-white/8 bg-[#071426] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <div className="flex flex-wrap gap-2">
                <input
                  value={repoInput}
                  onChange={(event) => setRepoInput(event.target.value)}
                  placeholder="Repo (optional)"
                  className="h-9 flex-1 rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                />
                <input
                  value={presetInput}
                  onChange={(event) => setPresetInput(event.target.value)}
                  placeholder="Workflow preset (optional)"
                  className="h-9 flex-1 rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={creating || !taskInput.trim()}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-50"
                >
                  {creating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />} Create
                </button>
              </div>
            </form>
          )}
        </section>

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{notice}</div>}
        {safetyNote && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2.5 text-xs leading-5 text-amber-200">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {safetyNote}
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <section>
            <div className="flex flex-wrap gap-2">
              {(['open', 'ready', 'closed', 'all'] as StatusFilter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={`h-8 rounded-full border px-3 text-xs font-medium capitalize ${
                    filter === option ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/8 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]'
                  }`}
                >
                  {option}
                  {option === 'open' && ` (${counts.open})`}
                  {option === 'ready' && ` (${counts.ready})`}
                  {option === 'closed' && ` (${counts.closed})`}
                  {option === 'all' && ` (${counts.total})`}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="mt-4 flex items-center justify-center py-16 text-slate-400">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading review plans
              </div>
            ) : items.length === 0 ? (
              !error && (
                <div className="mt-3">
                  <EmptyState icon={<ClipboardList className="h-5 w-5" />} title={`No ${filter === 'all' ? '' : filter} review plans.`} body="Create a review plan to gate a proposed execution behind explicit approval." />
                </div>
              )
            ) : (
              <div className="mt-3 space-y-2">
                {items.map((item) => (
                  <button
                    key={item.plan_id}
                    type="button"
                    onClick={() => void loadDetail(item.plan_id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedId === item.plan_id ? 'border-cyan-300/30 bg-cyan-300/[0.05]' : 'border-white/8 bg-[#0a192d]/70 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-slate-100">{item.task}</p>
                      <StatusBadge status={item.status} compact />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      {item.repo && <span className="rounded-full border border-white/10 px-2 py-0.5">{item.repo}</span>}
                      {item.skill_name && <span className="rounded-full border border-white/10 px-2 py-0.5">{item.skill_name}</span>}
                      {item.risk_level && <span className={`rounded-full border border-white/10 px-2 py-0.5 ${riskTone(item.risk_level)}`}>{item.risk_level} risk</span>}
                      <span className="rounded-full border border-white/10 px-2 py-0.5">{item.decision_count} decision{item.decision_count === 1 ? '' : 's'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            {!selectedId ? (
              <EmptyState icon={<Gavel className="h-5 w-5" />} title="Select a review plan." body="Approve, reject, request changes, or archive — plus pull an audit trail or evidence pack." />
            ) : detailLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading plan
              </div>
            ) : detailError ? (
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{detailError}</div>
            ) : detail ? (
              <div className="space-y-4">
                <article className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">{String(detail.task ?? selectedId)}</h4>
                    <StatusBadge status={String(detail.status ?? 'unknown')} compact />
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">{selectedId}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                      {detail.can_execute_now ? 'Can execute now' : 'Cannot execute yet'}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                      Adapter execution {detail.adapter_execution_enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>

                  <div className="mt-4 border-t border-white/8 pt-3">
                    <textarea
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                      placeholder="Note (optional)"
                      rows={2}
                      className="w-full resize-none rounded-lg border border-white/8 bg-[#071426] px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {DECISIONS.map((decision) => (
                        <button
                          key={decision}
                          type="button"
                          onClick={() => void submitDecision(decision)}
                          disabled={deciding !== null}
                          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs capitalize disabled:opacity-50 ${
                            decision === 'approved'
                              ? 'border-emerald-300/20 bg-emerald-300/8 text-emerald-200'
                              : decision === 'rejected'
                                ? 'border-rose-300/20 bg-rose-300/8 text-rose-200'
                                : 'border-white/8 bg-white/[0.04] text-slate-300'
                          }`}
                        >
                          {deciding === decision ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : decision === 'approved' ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : decision === 'rejected' ? (
                            <XCircle className="h-3.5 w-3.5" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          )}
                          {decision.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void loadAuditTrail()} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07]">
                    {panelLoading === 'audit' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />} Audit trail
                  </button>
                  <button type="button" onClick={() => void loadEvidencePack()} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07]">
                    {panelLoading === 'evidence' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />} Evidence pack
                  </button>
                  <button type="button" onClick={() => void exportPack('json')} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07]">
                    <Download className="h-3.5 w-3.5" /> Export JSON
                  </button>
                  <button type="button" onClick={() => void exportPack('markdown')} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07]">
                    <Download className="h-3.5 w-3.5" /> Export Markdown
                  </button>
                </div>

                {(auditTrail || evidencePack) && (
                  <article className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {auditTrail ? 'Audit trail' : 'Evidence pack'}
                    </h4>
                    <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-[#061126] p-3 font-mono text-[11px] leading-5 text-slate-300">
                      {JSON.stringify(auditTrail ?? evidencePack, null, 2)}
                    </pre>
                  </article>
                )}

                {typeof detail.updated_at === 'string' && (
                  <p className="text-[11px] text-slate-500">Last updated {formatDate(detail.updated_at)}</p>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
