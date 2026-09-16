import {
  Beaker,
  CheckCircle2,
  Gauge,
  ListTree,
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import type {
  OptimisationDecision,
  OptimisationDecisionsResponse,
  OptimisationExperiment,
  OptimisationExperimentsResponse,
  OptimisationStatsResponse,
} from '../types/api'

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function OptimisationPage() {
  const [stats, setStats] = useState<OptimisationStatsResponse | null>(null)
  const [decisions, setDecisions] = useState<OptimisationDecision[]>([])
  const [experiments, setExperiments] = useState<OptimisationExperiment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reverting, setReverting] = useState<string | null>(null)
  const [pendingRevert, setPendingRevert] = useState<OptimisationDecision | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsResponse, decisionsResponse, experimentsResponse] = await Promise.all([
        apiFetch<OptimisationStatsResponse>('/v1/optimisation/stats'),
        apiFetch<OptimisationDecisionsResponse>('/v1/optimisation/decisions'),
        apiFetch<OptimisationExperimentsResponse>('/v1/optimisation/experiments'),
      ])
      if (statsResponse.ok === false) {
        setStats(null)
        setError(statsResponse.error || 'Optimisation ledger is unavailable.')
      } else {
        setStats(statsResponse)
      }
      setDecisions(decisionsResponse.decisions ?? [])
      setExperiments(experimentsResponse.experiments ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Optimisation history could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  async function markReverted(decisionId: string) {
    setReverting(decisionId)
    setError(null)
    setNotice(null)
    try {
      await apiFetch(`/v1/optimisation/decisions/${encodeURIComponent(decisionId)}/revert`, { method: 'POST' })
      setNotice(`Decision ${decisionId} marked reverted in the ledger. External state was not changed.`)
      setPendingRevert(null)
      await loadAll()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Decision could not be marked reverted.')
    } finally {
      setReverting(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-hive-panel/75 p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Optimisation history</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Recorded optimisation activity</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                This page shows optimisation records that have actually been written to the HIVE ledger. It does not
                imply that every Council or repository recommendation is automatically captured. Reverting a record
                changes ledger state only; restoration of an external system remains the responsibility of its actuator.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 hover:bg-white/[0.07]"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        )}

        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/8 bg-hive-panel/70 p-3 text-center">
              <p className="text-lg font-semibold text-white">{stats.decision_count}</p>
              <p className="text-xs text-slate-400">Ledger records</p>
              {(stats.proposed_count ?? 0) > 0 && (
                <p className="mt-1 text-xs text-slate-500">{stats.proposed_count} proposed, not applied</p>
              )}
            </div>
            <div className="rounded-2xl border border-white/8 bg-hive-panel/70 p-3 text-center">
              <p className="text-lg font-semibold text-amber-300">
                {(stats.actioned_count ?? (stats.applied_count + stats.reverted_count)) > 0
                  ? pct(stats.reverted_rate ?? stats.rollback_rate)
                  : '—'}
              </p>
              <p className="text-xs text-slate-400">Marked reverted of actioned</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-hive-panel/70 p-3 text-center">
              <p className="text-lg font-semibold text-white">{stats.experiment_count}</p>
              <p className="text-xs text-slate-400">Recorded experiments</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-hive-panel/70 p-3 text-center">
              <p className="text-lg font-semibold text-emerald-300">
                {stats.experiment_count > 0 ? pct(stats.experiment_success_rate) : '—'}
              </p>
              <p className="text-xs text-slate-400">Experiment success</p>
            </div>
          </div>
        )}

        <section className="mt-8">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <ListTree className="h-4 w-4" /> Decision &amp; recommendation ledger
          </h3>
          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading decisions
            </div>
          ) : decisions.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={<Gauge className="h-5 w-5" />}
                title="No optimisation records yet."
                body="This remains empty until a connected producer writes a decision or recommendation to the optimisation ledger."
              />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {decisions.map((decision) => (
                <article key={decision.decision_id} className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{decision.description}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {decision.decision_type} · confidence {pct(decision.confidence)} · {formatDate(decision.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={decision.status} compact />
                      {decision.status === 'applied' && (
                        <button
                          type="button"
                          onClick={() => setPendingRevert(decision)}
                          disabled={reverting === decision.decision_id}
                          className="flex h-7 items-center gap-1 rounded-lg border border-amber-300/20 bg-amber-300/8 px-2 text-xs text-amber-200 disabled:opacity-50"
                        >
                          {reverting === decision.decision_id ? (
                            <LoaderCircle className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Mark reverted
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <Beaker className="h-4 w-4" /> Experiments
          </h3>
          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading experiments
            </div>
          ) : experiments.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={<Beaker className="h-5 w-5" />}
                title="No experiments recorded yet."
                body="Only persisted experiment records appear here; HIVE does not infer experiments from unrelated activity."
              />
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {experiments.map((experiment) => (
                <article key={experiment.experiment_id} className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-100">{experiment.name}</p>
                    {experiment.success ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-rose-300" />
                    )}
                  </div>
                  {experiment.hypothesis && (
                    <p className="mt-1.5 text-xs text-slate-500"><span className="text-slate-400">Hypothesis:</span> {experiment.hypothesis}</p>
                  )}
                  {experiment.outcome && (
                    <p className="mt-1 text-xs text-slate-500"><span className="text-slate-400">Outcome:</span> {experiment.outcome}</p>
                  )}
                  <p className="mt-1.5 text-xs text-slate-600">{formatDate(experiment.created_at)}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <ConfirmDialog
          open={Boolean(pendingRevert)}
          title="Mark optimisation record reverted?"
          summary="This changes the HIVE ledger record only. It does not restore the previous state in the external system."
          objectName={pendingRevert?.description}
          systems={['HIVE optimisation ledger (D1 metadata)']}
          confirmLabel={reverting ? 'Marking reverted…' : 'Mark reverted'}
          busy={Boolean(reverting)}
          onConfirm={() => pendingRevert && void markReverted(pendingRevert.decision_id)}
          onCancel={() => {
            if (!reverting) setPendingRevert(null)
          }}
        />
      </div>
    </div>
  )
}
