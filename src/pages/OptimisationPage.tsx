import {
  Beaker,
  CheckCircle2,
  FileWarning,
  Gauge,
  ListTree,
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
  ShieldQuestion,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import type {
  EnvironmentAuditResponse,
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
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  const [audit, setAudit] = useState<EnvironmentAuditResponse | null>(null)
  const [auditLoading, setAuditLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsResponse, decisionsResponse, experimentsResponse] = await Promise.all([
        apiFetch<OptimisationStatsResponse>('/v1/optimisation/stats'),
        apiFetch<OptimisationDecisionsResponse>('/v1/optimisation/decisions'),
        apiFetch<OptimisationExperimentsResponse>('/v1/optimisation/experiments'),
      ])
      setStats(statsResponse)
      setDecisions(decisionsResponse.decisions ?? [])
      setExperiments(experimentsResponse.experiments ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Optimisation ledger could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    try {
      const response = await apiFetch<EnvironmentAuditResponse>('/v1/environment/audit')
      setAudit(response)
    } catch {
      setAudit(null)
    } finally {
      setAuditLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
    void loadAudit()
  }, [loadAll, loadAudit])

  async function rollback(decisionId: string) {
    setRollingBack(decisionId)
    setError(null)
    setNotice(null)
    try {
      await apiFetch(`/v1/optimisation/decisions/${encodeURIComponent(decisionId)}/rollback`, { method: 'POST' })
      setNotice(`Decision ${decisionId} marked reverted in the ledger.`)
      await loadAll()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Decision could not be rolled back.')
    } finally {
      setRollingBack(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Optimisation engine</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Decision ledger &amp; experiments</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Every automated decision HIVE makes — a Council promotion acted on, a Repository Council
                recommendation applied — is recorded here with enough prior state to roll back. This is the ledger,
                not the actuator: rollback marks the decision reverted, it does not re-apply the previous state to
                whatever system it touched.
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

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-3 text-center">
              <p className="text-lg font-semibold text-white">{stats.decision_count}</p>
              <p className="text-[11px] text-slate-400">Decisions</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-3 text-center">
              <p className="text-lg font-semibold text-amber-300">{pct(stats.rollback_rate)}</p>
              <p className="text-[11px] text-slate-400">Rollback rate</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-3 text-center">
              <p className="text-lg font-semibold text-white">{stats.experiment_count}</p>
              <p className="text-[11px] text-slate-400">Experiments</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-3 text-center">
              <p className="text-lg font-semibold text-emerald-300">{pct(stats.experiment_success_rate)}</p>
              <p className="text-[11px] text-slate-400">Experiment success</p>
            </div>
          </div>
        )}

        <section className="mt-8">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <ListTree className="h-4 w-4" /> Decision ledger
          </h3>
          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading decisions</div>
          ) : decisions.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon={<Gauge className="h-5 w-5" />} title="No optimisation decisions recorded yet." />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {decisions.map((decision) => (
                <article key={decision.decision_id} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{decision.description}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{decision.decision_type} · confidence {pct(decision.confidence)} · {formatDate(decision.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={decision.status} compact />
                      {decision.status === 'applied' && (
                        <button
                          type="button"
                          onClick={() => void rollback(decision.decision_id)}
                          disabled={rollingBack === decision.decision_id}
                          className="flex h-7 items-center gap-1 rounded-lg border border-amber-300/20 bg-amber-300/8 px-2 text-[11px] text-amber-200 disabled:opacity-50"
                        >
                          {rollingBack === decision.decision_id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Rollback
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
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading experiments</div>
          ) : experiments.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon={<Beaker className="h-5 w-5" />} title="No experiments recorded yet." />
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {experiments.map((experiment) => (
                <article key={experiment.experiment_id} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-100">{experiment.name}</p>
                    {experiment.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /> : <XCircle className="h-4 w-4 shrink-0 text-rose-300" />}
                  </div>
                  {experiment.hypothesis && <p className="mt-1.5 text-[11px] text-slate-500"><span className="text-slate-400">Hypothesis:</span> {experiment.hypothesis}</p>}
                  {experiment.outcome && <p className="mt-1 text-[11px] text-slate-500"><span className="text-slate-400">Outcome:</span> {experiment.outcome}</p>}
                  <p className="mt-1.5 text-[11px] text-slate-600">{formatDate(experiment.created_at)}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <ShieldQuestion className="h-4 w-4" /> Environment variable audit
          </h3>
          {auditLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading audit</div>
          ) : !audit ? (
            <div className="mt-3">
              <EmptyState icon={<FileWarning className="h-5 w-5" />} title="Environment audit unavailable." />
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-xl font-semibold ${audit.coverage_ratio >= 0.9 ? 'text-emerald-300' : audit.coverage_ratio >= 0.7 ? 'text-amber-300' : 'text-rose-300'}`}>
                  {pct(audit.coverage_ratio)}
                </span>
                <span className="text-xs text-slate-400">
                  {audit.documented_field_count}/{audit.total_settings_fields} settings fields documented in {audit.env_example_path}
                  {!audit.env_example_found && ' (file not found)'}
                </span>
              </div>

              {audit.undocumented_fields.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3">
                  <p className="text-xs font-semibold text-amber-200">{audit.undocumented_field_count} settings field{audit.undocumented_field_count === 1 ? '' : 's'} missing from .env.example</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {audit.undocumented_fields.map((field) => (
                      <span key={field.field} title={field.expected_env_names.join(', ')} className="rounded-full border border-amber-300/20 px-2 py-0.5 text-[11px] text-amber-100">
                        {field.field}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {audit.extra_in_env_example.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <p className="text-xs font-semibold text-slate-300">{audit.extra_in_env_example.length} name{audit.extra_in_env_example.length === 1 ? '' : 's'} in .env.example with no matching setting</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {audit.extra_in_env_example.map((name) => (
                      <span key={name} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400">{name}</span>
                    ))}
                  </div>
                </div>
              )}

              {audit.undocumented_fields.length === 0 && audit.extra_in_env_example.length === 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Settings and .env.example are fully in sync.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
