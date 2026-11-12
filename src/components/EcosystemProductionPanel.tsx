import { useCallback, useEffect, useState } from 'react'
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
  detail?: string
  gate_evidence?: {
    sha?: string | null
    reason?: string
    required_workflows?: Record<string, Gate>
    deployment?: Gate & { workflow?: string }
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

export function EcosystemProductionPanel() {
  const [report, setReport] = useState<ProductionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
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
  const byId = new Map((report?.repositories || []).map((item) => [item.repository_id, item]))
  const complete = report?.repositories.length === GOVERNED_REPOSITORIES.length
    && GOVERNED_REPOSITORIES.every((id) => byId.has(id))
  const current = Boolean(report && complete && !stale)
  const warnings = report?.repositories.reduce((total, item) => total + (item.gate_evidence?.additional_workflow_failures?.length || 0), 0) || 0

  return (
    <section id="ecosystem-production-readiness" aria-label="Ecosystem production readiness" className="mt-4 rounded-2xl border border-white/8 bg-hive-panel/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Ecosystem production readiness</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Runtime readiness, required CI/security checks and deployment evidence for all eight repositories.
            Snapshot freshness below describes HIVE’s indexed code; it does not certify production delivery.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh production evidence
        </button>
      </div>
      <div role="status" className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <StatusBadge status={current ? tone(report?.state) : 'unknown'} label={loading ? 'Checking' : current ? report?.state : 'Unknown'} />
        <span>Release decision: {current ? report?.release_decision : 'Not verified'}</span>
        {report?.generated_at && <span>Observed {formatDate(report.generated_at)}</span>}
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-rose-200">{error}</p>}
      {report && !current && <p className="mt-3 text-xs text-amber-200">Evidence is stale or incomplete. Refresh before relying on this decision.</p>}
      {warnings > 0 && <p className="mt-3 text-xs text-amber-200">{warnings} additional workflow failure(s) need attention, separate from the required release gates.</p>}
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {GOVERNED_REPOSITORIES.map((id) => {
          const item = byId.get(id)
          const gates = item?.gate_evidence
          return (
            <article key={id} className="rounded-xl border border-white/8 bg-hive-surface p-3 text-xs text-slate-400">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-white">{id}</h4>
                <StatusBadge status={current ? tone(item?.state) : 'unknown'} label={current ? item?.state : 'Unknown'} compact />
              </div>
              <p className="mt-2">Runtime: {current ? item?.runtime_state : 'Not verified'}</p>
              <p className="mt-1">Deployment: {current ? gates?.deployment?.status || 'Unknown' : 'Not verified'}</p>
              {gates?.sha && <p className="mt-1 font-mono">Commit {gates.sha.slice(0, 12)}</p>}
              {current && <p className="mt-2 leading-5">{gates?.reason || item?.detail}</p>}
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-300">Evidence and workflow warnings</summary>
                {Object.entries(gates?.required_workflows || {}).map(([name, gate]) => (
                  <p key={name} className="mt-1">{name}: {gate.status || 'Unknown'}</p>
                ))}
                {(gates?.additional_workflow_failures || []).map((failure) => (
                  <p key={failure.workflow} className="mt-2 text-amber-200">{failure.workflow}: {failure.status}</p>
                ))}
                {!gates && <p className="mt-1">No current evidence received.</p>}
              </details>
            </article>
          )
        })}
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
  return (
    <section aria-label="Recent scheduled work" className="mt-4 rounded-2xl border border-white/8 bg-hive-panel/60 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-white">Recent scheduled work</h3>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        Latest recorded MAST executions, including content and KDP jobs. A successful scheduler heartbeat confirms the worker is alive;
        individual receipts show whether work completed. These are execution records, not the active schedule or proof of email delivery.
      </p>
      <p className="mt-2 text-xs text-slate-400">Last scheduler tick: {formatDate(typeof payload?.last_tick_at === 'string' ? payload.last_tick_at : null)}</p>
      {!receipts.length ? <p className="mt-3 text-xs text-amber-200">Scheduled work evidence is unavailable. No successful deliveries are inferred.</p> : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {receipts.map((item) => (
            <li key={item.job} className="rounded-xl border border-white/8 p-3 text-xs text-slate-400">
              <div className="flex items-start justify-between gap-3">
                <span className="break-words font-medium text-slate-200">{item.job}</span>
                <StatusBadge status={item.ok ? 'completed' : 'failed'} label={item.ok ? 'Succeeded' : 'Failed'} compact />
              </div>
              <p className="mt-1">{item.group} · {formatDate(item.finished_at)}</p>
              {item.operation_status && <p className="mt-1">{item.operation_status}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
