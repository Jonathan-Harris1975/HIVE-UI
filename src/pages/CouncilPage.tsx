import { AlertTriangle, Gauge, History, LoaderCircle, Plus, Sparkles, TrendingUp, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import type {
  AiCouncilHistoryResponse,
  AiCouncilRunReport,
  BenchmarkCandidateInput,
  BenchmarkMetricKeysResponse,
  BenchmarkRankResponse,
  BenchmarkRankResult,
} from '../types/api'

function emptyCandidate(): BenchmarkCandidateInput {
  return { model_id: '' }
}

const METRIC_LABELS: Record<string, string> = {
  coding_benchmark: 'Coding',
  reasoning_benchmark: 'Reasoning',
  cost: 'Cost (1.0 = cheapest)',
  latency: 'Latency (1.0 = fastest)',
  reliability: 'Reliability',
  long_context: 'Long context',
  json_reliability: 'JSON reliability',
  structured_output: 'Structured output',
  community_maturity: 'Community maturity',
  internal_historical_performance: 'Internal history',
}

export function CouncilPage() {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [running, setRunning] = useState(false)
  const [latestRun, setLatestRun] = useState<AiCouncilRunReport | null>(null)
  const [history, setHistory] = useState<AiCouncilRunReport[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [metricKeys, setMetricKeys] = useState<readonly string[]>([])
  const [candidates, setCandidates] = useState<BenchmarkCandidateInput[]>([emptyCandidate()])
  const [ranking, setRanking] = useState<BenchmarkRankResult[]>([])
  const [rankingLoading, setRankingLoading] = useState(false)
  const [rankingError, setRankingError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await apiFetch<AiCouncilHistoryResponse>('/v1/ai-council/history?limit=20')
      setHistory(response.runs ?? [])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHistory()
    apiFetch<BenchmarkMetricKeysResponse>('/v1/benchmark/metrics')
      .then((response) => setMetricKeys(response.metric_keys ?? []))
      .catch(() => setMetricKeys([]))
  }, [loadHistory])

  async function runCouncil() {
    setRunning(true)
    setError(null)
    setNotice(null)
    try {
      const report = await apiFetch<AiCouncilRunReport>('/v1/ai-council/run', { method: 'POST' })
      setLatestRun(report)
      setNotice(
        `Council run complete: ${report.providers_discovered} providers, ${report.models_seen} models seen, ${report.promotions.length} promoted.`,
      )
      await loadHistory()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI Council run failed.')
    } finally {
      setRunning(false)
    }
  }

  function updateCandidate(index: number, patch: Partial<BenchmarkCandidateInput>) {
    setCandidates((current) => current.map((candidate, i) => (i === index ? { ...candidate, ...patch } : candidate)))
  }

  function addCandidate() {
    setCandidates((current) => [...current, emptyCandidate()])
  }

  function removeCandidate(index: number) {
    setCandidates((current) => current.filter((_, i) => i !== index))
  }

  async function runRanking() {
    const valid = candidates.filter((c) => c.model_id.trim())
    if (valid.length === 0) return
    setRankingLoading(true)
    setRankingError(null)
    setNotice(null)
    try {
      const response = await apiFetch<BenchmarkRankResponse>('/v1/benchmark/rank', {
        method: 'POST',
        body: JSON.stringify({ candidates: valid }),
      })
      setRanking(response.ranking ?? [])
    } catch (caught) {
      setRankingError(caught instanceof Error ? caught.message : 'Benchmark ranking failed.')
      setRanking([])
    } finally {
      setRankingLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">AI Council &amp; Benchmark</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Provider discovery, promotion &amp; model ranking</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            The Council discovers configured providers, diffs their catalogues against the last run, and auto-promotes
            qualifying models into the Model Registry. The Benchmark Engine below lets you rank arbitrary candidates
            with configurable weights.
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2.5 text-xs leading-5 text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Metrics come only from what each provider's own API exposes (pricing, context length, declared
            capabilities) plus run-over-run history — there is no live coding/reasoning benchmark data source wired
            in. Treat promotion decisions accordingly.
          </div>
        </section>

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

        <section className="mt-6 rounded-3xl border border-white/8 bg-[#0a192d]/70 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Gauge className="h-4 w-4 text-cyan-300" /> AI Council</h3>
            <button
              type="button"
              onClick={() => void runCouncil()}
              disabled={running}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-medium text-cyan-100 disabled:opacity-50"
            >
              {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Run council
            </button>
          </div>

          {latestRun && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-white/8 px-2.5 py-2"><p className="text-sm font-semibold text-white">{latestRun.providers_discovered}</p><p className="text-slate-400">Providers</p></div>
              <div className="rounded-lg border border-white/8 px-2.5 py-2"><p className="text-sm font-semibold text-white">{latestRun.models_seen}</p><p className="text-slate-400">Models seen</p></div>
              <div className="rounded-lg border border-emerald-300/15 px-2.5 py-2"><p className="text-sm font-semibold text-emerald-300">{latestRun.new_models.length}</p><p className="text-slate-400">New</p></div>
              <div className="rounded-lg border border-rose-300/15 px-2.5 py-2"><p className="text-sm font-semibold text-rose-300">{latestRun.retired_models.length}</p><p className="text-slate-400">Retired</p></div>
            </div>
          )}
          {latestRun && latestRun.promotions.length > 0 && (
            <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
              <p className="text-xs font-semibold text-cyan-100">Promoted this run</p>
              <div className="mt-1.5 space-y-1">
                {latestRun.promotions.map((promo, index) => (
                  <div key={index} className="flex items-center justify-between text-xs text-slate-300">
                    <span>{promo.model_id} <span className="text-slate-500">→ {promo.category}</span></span>
                    <span className="text-emerald-300">{(promo.score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-white/8 pt-4">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400"><History className="h-3.5 w-3.5" /> Run history</h4>
            {historyLoading ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading history</div>
            ) : history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No Council runs recorded yet.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {history.slice(-8).reverse().map((run) => (
                  <div key={run.run_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-1.5 text-xs text-slate-400">
                    <span>{formatDate(run.occurred_at)}</span>
                    <span>{run.providers_discovered} providers · {run.models_seen} models · {run.promotions.length} promoted</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/8 bg-[#0a192d]/70 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><TrendingUp className="h-4 w-4 text-cyan-300" /> Benchmark ranking</h3>
            <button
              type="button"
              onClick={() => void runRanking()}
              disabled={rankingLoading || candidates.every((c) => !c.model_id.trim())}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-medium text-cyan-100 disabled:opacity-50"
            >
              {rankingLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />} Rank candidates
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Enter one or more candidate models with any metrics you have (0.0–1.0, already normalised). Missing
            metrics lower a candidate's confidence rather than its score.
          </p>

          <div className="mt-4 space-y-3">
            {candidates.map((candidate, index) => (
              <div key={index} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={candidate.model_id}
                    onChange={(event) => updateCandidate(index, { model_id: event.target.value })}
                    placeholder="model_id (e.g. anthropic/claude-sonnet-5)"
                    className="h-9 flex-1 rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
                  />
                  {candidates.length > 1 && (
                    <button type="button" onClick={() => removeCandidate(index)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-300/20 bg-rose-300/8 text-rose-200 hover:bg-rose-300/12">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {metricKeys.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {metricKeys.map((key) => (
                      <label key={key} className="text-[11px] text-slate-400">
                        {METRIC_LABELS[key] ?? key}
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={(candidate as Record<string, unknown>)[key] as number | undefined ?? ''}
                          onChange={(event) =>
                            updateCandidate(index, {
                              [key]: event.target.value === '' ? undefined : Number(event.target.value),
                            } as Partial<BenchmarkCandidateInput>)
                          }
                          className="mt-1 h-8 w-full rounded-lg border border-white/8 bg-[#071426] px-2 text-xs text-slate-100 outline-none focus:border-cyan-300/30"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addCandidate}
            className="mt-3 flex h-8 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07]"
          >
            <Plus className="h-3.5 w-3.5" /> Add candidate
          </button>

          {rankingError && <p className="mt-3 text-xs text-rose-300">{rankingError}</p>}

          {ranking.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="No ranking yet." body="Add candidates and metrics above, then rank them." />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {ranking
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((result, index) => (
                  <div key={result.model_id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[11px] text-slate-400">{index + 1}</span>
                      <span className="text-sm text-slate-100">{result.model_id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>confidence {(result.confidence * 100).toFixed(0)}%</span>
                      <span className="text-sm font-semibold text-emerald-300">{(result.score * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
