import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LoaderCircle, RefreshCcw } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import { GOVERNED_REPOSITORIES } from '../lib/repositories'
import { StatusBadge } from './StatusBadge'
import type { RepoHealthItem } from '../types/api'

type Gate = { state?: string; status?: string; run_id?: number | null }
type RepositoryEvidence = {
  repository_id: string
  state: string
  runtime_state: string
  health_status?: string
  readiness_status?: string
  readiness?: { status?: string; detail?: string; http_status?: number | null }
  detail?: string
  gate_evidence?: {
    sha?: string | null
    reason?: string
    verification_status?: string
    required_workflows?: Record<string, Gate>
    deployment?: Gate & { workflow?: string }
    additional_workflows_complete?: boolean
    additional_workflow_failures?: Array<{ workflow: string; status: string; run_id?: number }>
  }
}
type ProductionReport = {
  ok: boolean
  generated_at?: string
  state: string
  release_decision: string
  reason?: string
  repositories: RepositoryEvidence[]
}

const STALE_AFTER_MS = 120_000
const tone = (state?: string) => state === 'GREEN' ? 'ready' : state === 'BLOCKED' ? 'error' : state === 'DEGRADED' ? 'warning' : 'unknown'
const productionLabel = (state?: string) => state === 'GREEN' ? 'Ready' : state === 'BLOCKED' ? 'Blocked' : state === 'DEGRADED' ? 'Degraded' : 'Unknown'
const runtimeLabel = (state?: string) => state === 'GREEN' ? 'Ok' : productionLabel(state)

// Keep release decisions independent of presentation, including during a rolling backend upgrade.
function releasePresentation(item?: RepositoryEvidence): { status: string; label: string } {
  if (!item) return { status: 'unknown', label: 'Unknown' }
  if (item.runtime_state === 'BLOCKED') return { status: 'error', label: 'Blocked' }
  const evidence = item.gate_evidence
  const gates = [...Object.values(evidence?.required_workflows || {}), evidence?.deployment]
  const observed = gates.map((gate) => gate?.status)
  const failed = gates.some((gate) => gate?.state === 'BLOCKED')
    || observed.some((status) => ['failure', 'timed_out', 'startup_failure', 'action_required'].includes(status || ''))
  if (item.state === 'BLOCKED' || failed || evidence?.verification_status === 'FAILED') {
    return { status: 'error', label: failed || evidence?.verification_status === 'FAILED' ? 'Release verification failed' : 'Blocked' }
  }
  if (item.runtime_state !== 'GREEN') return { status: 'warning', label: 'Runtime not verified' }
  if (item.state === 'GREEN') return { status: 'ready', label: 'Ready' }
  if (evidence?.verification_status === 'UNAVAILABLE' || observed.includes('unavailable')) {
    return { status: 'unknown', label: 'Evidence unavailable' }
  }
  if (evidence?.verification_status === 'IN_PROGRESS' || observed.includes('pending')) {
    return { status: 'checking', label: 'Verification in progress' }
  }
  if (evidence?.verification_status === 'AWAITING_EVIDENCE' || observed.includes('missing')) {
    return { status: 'unknown', label: 'Awaiting verification' }
  }
  return { status: 'unknown', label: 'Release unverified' }
}

function gateSummary(item?: RepositoryEvidence): string {
  const evidence = item?.gate_evidence
  if (!evidence) return 'No current gate summary.'
  if (evidence.verification_status) return evidence.reason || 'No current gate summary.'
  // Older backends combine missing evidence and failure; display individual receipts instead.
  const entries = Object.entries(evidence.required_workflows || {})
  if (evidence.deployment) entries.push([evidence.deployment.workflow || 'Deployment verification', evidence.deployment])
  const outstanding = entries.filter(([, gate]) => gate.status !== 'success')
  if (outstanding.length) return outstanding.map(([name, gate]) => name + ': ' + (gate.status || 'unverified')).join('; ')
  return item?.state === 'GREEN' ? 'Required release evidence verified.' : 'Release evidence not fully verified.'
}
function gateTone(gates: Gate[]): string {
  if (!gates.length) return 'unknown'
  if (gates.some((gate) => gate.state === 'BLOCKED' || ['failure', 'timed_out', 'startup_failure', 'action_required'].includes(gate.status || ''))) return 'failed'
  if (gates.every((gate) => gate.status === 'success')) return 'ready'
  if (gates.some((gate) => ['pending', 'queued', 'in_progress', 'requested'].includes(gate.status || ''))) return 'checking'
  return 'unknown'
}
const decisionLabel = (decision?: string) => decision === 'ALLOW' ? 'Allowed' : decision === 'BLOCK' ? 'Blocked' : decision || 'Unknown'

export function EcosystemProductionPanel({ renderRepositoryDetails }: { renderRepositoryDetails?: (id: string) => ReactNode }) {
  const [report, setReport] = useState<ProductionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'attention' | 'ready' | 'unknown'>('all')
  const [sortBy, setSortBy] = useState<'attention' | 'name'>('attention')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setReport(null)
    try {
      const result = await apiFetch<ProductionReport>('/v1/system/production-manager', { signal: AbortSignal.timeout(65_000) })
      if (result.ok !== true || !Array.isArray(result.repositories)) throw new Error('Production evidence is unavailable.')
      setReport(result)
      setNow(Date.now())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Production evidence could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const observed = Date.parse(report?.generated_at || '')
  const stale = !Number.isFinite(observed) || now - observed > STALE_AFTER_MS || observed > now + 60_000
  const byId = useMemo(
    () => new Map((report?.repositories || []).map((item) => [item.repository_id, item])),
    [report],
  )
  const complete = report?.repositories.length === GOVERNED_REPOSITORIES.length
    && GOVERNED_REPOSITORIES.every((id) => byId.has(id))
  const current = Boolean(report && complete && !stale)
  const incomplete = report?.repositories.filter((item) => item.gate_evidence?.additional_workflows_complete !== true).length || 0
  const warnings = report?.repositories.reduce((total, item) => total + (item.gate_evidence?.additional_workflow_failures?.length || 0), 0) || 0
  const runtimeHealthy = current ? report!.repositories.filter((item) => item.runtime_state === 'GREEN').length : null
  const repositoryIds = useMemo(() => {
    const matches = GOVERNED_REPOSITORIES.filter((id) => {
      const item = byId.get(id)
      const textMatches = id.toLowerCase().includes(query.trim().toLowerCase())
      const attention = current && Boolean(item) && (
        item!.state !== 'GREEN'
        || item!.runtime_state !== 'GREEN'
        || item!.gate_evidence?.additional_workflows_complete !== true
        || Boolean(item!.gate_evidence?.additional_workflow_failures?.length)
      )
      const statusMatches = filter === 'all'
        || (filter === 'unknown' && !current)
        || (filter === 'attention' && attention)
        || (filter === 'ready' && current && !attention)
      return textMatches && statusMatches
    })
    return matches.sort((left, right) => {
      if (sortBy === 'name') return left.localeCompare(right)
      const attentionRank = (id: string) => {
        const item = byId.get(id)
        return current && item && (
          item.state !== 'GREEN'
          || item.runtime_state !== 'GREEN'
          || item.gate_evidence?.additional_workflows_complete !== true
          || Boolean(item.gate_evidence?.additional_workflow_failures?.length)
        ) ? 0 : 1
      }
      return attentionRank(left) - attentionRank(right) || left.localeCompare(right)
    })
  }, [byId, current, filter, query, sortBy])

  return (
    <section id="ecosystem-production-readiness" aria-label="Ecosystem production readiness" className="mt-4 rounded-2xl border border-white/8 bg-hive-panel/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Production readiness and governed repositories</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            One view of runtime, release evidence and governed snapshots for all eight repositories.
            A current snapshot describes indexed code; it does not certify production delivery.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh production evidence
        </button>
      </div>
      <div role="status" aria-live="polite" className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <StatusBadge
          status={current ? (report?.state === 'DEGRADED' ? 'unknown' : tone(report?.state)) : 'unknown'}
          label={loading ? 'Checking' : current
            ? (report?.state === 'DEGRADED' ? 'Verification or runtime evidence incomplete' : productionLabel(report?.state))
            : 'Unknown'}
        />
        <span>Release decision: {current ? decisionLabel(report?.release_decision) : 'Not verified'}</span>
        <span>Runtime health: {current ? `${runtimeHealthy}/${GOVERNED_REPOSITORIES.length} healthy` : 'Not verified'}</span>
        {report?.generated_at && <span>Observed {formatDate(report.generated_at)}</span>}
      </div>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-500">
        Runtime, release and snapshot evidence are independent.
      </p>
      {loading && (
        <p role="status" aria-live="polite" className="mt-3 text-xs text-slate-300">
          Checking live runtime and release evidence. No status is inferred until the complete report is current.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/8 px-3 py-2 text-xs text-rose-100">
          Production evidence unavailable: {error} No release decision or runtime health is inferred.
        </p>
      )}
      {report && !current && (
        <p role="status" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/7 px-3 py-2 text-xs text-amber-100">
          Evidence is stale or incomplete. Runtime health and release readiness are unknown until a complete, current report is available.
        </p>
      )}
      {incomplete > 0 && <p className="mt-3 text-xs text-amber-200">Additional workflow discovery is incomplete for {incomplete} repositories; further failures may be unobserved.</p>}
      {warnings > 0 && (
        <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">
          {warnings} additional workflow failure(s) need attention, separate from the required release gates.
        </p>
      )}
      <div className="mt-4 grid gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
        <label className="text-xs text-slate-400">Find repository
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by repository name"
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-hive-surface px-3 text-sm text-white placeholder:text-slate-500"
          />
        </label>
        <label className="text-xs text-slate-400">Show
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-hive-surface px-3 text-sm text-white sm:min-w-40"
          >
            <option value="all">All repositories</option><option value="attention">Needs attention</option><option value="ready">Ready</option><option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">Sort
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-hive-surface px-3 text-sm text-white sm:min-w-40"
          >
            <option value="attention">Attention first</option><option value="name">Name</option>
          </select>
        </label>
        <p role="status" aria-live="polite" className="text-xs text-slate-500 sm:col-span-3">Showing {repositoryIds.length} of {GOVERNED_REPOSITORIES.length} repositories</p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {repositoryIds.map((id) => {
          const item = byId.get(id)
          const gates = item?.gate_evidence
          const presentation = releasePresentation(item)
          const ci = current ? gateTone(Object.values(gates?.required_workflows || {})) : 'unknown'
          const deployment = current && gates?.deployment ? gateTone([gates.deployment]) : 'unknown'
          const runtime = current ? tone(item?.runtime_state) : 'unknown'
          return (
            <article key={id} className="hive-repository-card border bg-hive-surface p-3 text-xs text-slate-400">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-white">{id}</h4>
                <StatusBadge status={current ? presentation.status : 'unknown'} label={current ? presentation.label : 'Unknown'} compact />
              </div>
              <div className="hive-gate-grid" aria-label={id + ' evidence summary'}>
                {([['Runtime', runtime], ['CI', ci], ['Deploy', deployment]] as const).map(([label, status]) => (
                  <div key={label}><span>{label}</span><StatusBadge status={status} label={label + ' evidence: ' + status} /></div>
                ))}
              </div>
              <details className="mt-2" open={expanded[id] ?? (current && item?.state !== 'GREEN')}
                onToggle={(event) => {
                  const open = event.currentTarget.open
                  setExpanded((prior) => prior[id] === open ? prior : { ...prior, [id]: open })
                }}>
                <summary className="cursor-pointer py-2 text-slate-300">Detailed evidence</summary>
              <p className="mt-2">Runtime: {current ? runtimeLabel(item?.runtime_state) : 'Not verified'}</p>
              <p className="mt-1">Deployment: {current ? gates?.deployment?.status || 'Unknown' : 'Not verified'}</p>
              {renderRepositoryDetails?.(id)}
              {current && item?.runtime_state !== 'GREEN' && (
                <div className="mt-2 text-amber-200">
                  <p>Health: {item?.health_status || 'Unknown'} · Readiness: {item?.readiness_status || 'Unknown'}</p>
                  <p className="mt-1 leading-5">{item?.readiness?.detail || item?.detail || 'Runtime evidence is not healthy or not verified.'}</p>
                  {item?.readiness?.http_status && <p>Readiness HTTP {item.readiness.http_status}</p>}
                </div>
              )}
              {current && item?.state !== 'GREEN' && <p className="mt-2 leading-5">CI/deployment: {gateSummary(item)}</p>}
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-300">Evidence and workflow warnings</summary>
                {gates?.sha && <p className="mt-1 font-mono">Commit {gates.sha.slice(0, 12)}</p>}
                {current && item?.state === 'GREEN' && <p className="mt-1 leading-5">CI/deployment: {gateSummary(item)}</p>}
                {Object.entries(gates?.required_workflows || {}).map(([name, gate]) => (
                  <p key={name} className="mt-1">{name}: {gate.status || 'Unknown'}</p>
                ))}
                {(gates?.additional_workflow_failures || []).map((failure) => (
                  <p key={failure.workflow} className="mt-2 text-amber-200">{failure.workflow}: {failure.status}</p>
                ))}
                {!gates && <p className="mt-1">No current evidence received.</p>}
              </details>
              </details>
            </article>
          )
        })}
        {!repositoryIds.length && (
          <p className="rounded-xl border border-white/8 bg-hive-surface p-4 text-sm text-slate-400 md:col-span-2 xl:col-span-4">
            No repositories match these filters. Change the search or status filter.
          </p>
        )}
      </div>
    </section>
  )
}

type JobReceipt = { job: string; group?: string; ok: boolean; finished_at?: string; operation_status?: string | null }
function isJobReceipt(value: unknown): value is JobReceipt {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<JobReceipt>
  return typeof item.job === 'string' && typeof item.ok === 'boolean'
}

export function ScheduledWorkPanel({ scheduler }: { scheduler?: RepoHealthItem }) {
  const payload = scheduler?.operational?.payload
  const receipts = Array.isArray(payload?.recent_jobs) ? payload.recent_jobs.filter(isJobReceipt) : []
  const priorityReceipts = [...receipts].sort((left, right) =>
    Number(left.ok) - Number(right.ok)
      || Date.parse(right.finished_at || '') - Date.parse(left.finished_at || ''),
  )
  const visibleReceipts = priorityReceipts.slice(0, 6)
  const olderReceipts = priorityReceipts.slice(6)
  const failedCount = receipts.filter((item) => !item.ok).length
  const renderReceipt = (item: JobReceipt, index: number) => (
    <li key={`${item.job}-${item.finished_at || index}`} className={`rounded-xl border p-3 text-xs ${item.ok ? 'border-white/8' : 'border-rose-300/20 bg-rose-300/[0.035]'}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="break-words font-medium text-slate-200">{item.job}</span>
        <StatusBadge status={item.ok ? 'completed' : 'failed'} label={item.ok ? 'Succeeded' : 'Failed'} compact />
      </div>
      <p className="mt-1 text-slate-400">{item.group || 'Unassigned group'} · {formatDate(item.finished_at)}</p>
      {item.operation_status && <p className="mt-1 leading-5 text-slate-300">{item.operation_status}</p>}
    </li>
  )
  return (
    <section aria-label="Recent scheduled work" className="mt-4 rounded-2xl border border-white/8 bg-hive-panel/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Recent scheduled work</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Latest recorded MAST executions, including content and KDP jobs. A heartbeat means the worker is alive;
            receipts show whether individual work completed. These are not the active schedule or proof of email delivery.
          </p>
        </div>
        <span className="text-xs text-slate-400">Last scheduler tick: {formatDate(typeof payload?.last_tick_at === 'string' ? payload.last_tick_at : null)}</span>
      </div>
      {!receipts.length ? (
        <p role="status" className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-xs text-amber-100">
          Scheduled work evidence is unavailable. No successful deliveries are inferred.
        </p>
      ) : (
        <>
          <div
            role="status"
            aria-live="polite"
            className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
              failedCount
                ? 'border-rose-300/20 bg-rose-300/[0.05] text-rose-100'
                : 'border-emerald-300/15 bg-emerald-300/[0.04] text-emerald-100'
            }`}
          >
            {failedCount
              ? `Failed execution${failedCount === 1 ? '' : 's'}: ${failedCount} of ${receipts.length} recent receipts. Failed work is shown first for quick review.`
              : `No failures in ${receipts.length} recent receipts.`}
          </div>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {visibleReceipts.map(renderReceipt)}
          </ul>
          {olderReceipts.length > 0 && (
            <details className="mt-3 rounded-xl border border-white/8 px-3 py-2">
              <summary className="cursor-pointer text-xs text-cyan-100">Older execution receipts ({olderReceipts.length})</summary>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">{olderReceipts.map(renderReceipt)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}
