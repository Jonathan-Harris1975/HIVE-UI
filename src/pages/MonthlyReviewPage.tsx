import { CalendarClock, DollarSign, FileWarning, LoaderCircle, RefreshCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { useInspector } from '../context/InspectorContext'
import { apiFetch, ApiError } from '../lib/api'
import { formatDate } from '../lib/format'
import type { MonthlyReviewHistoryResponse, MonthlyReviewReport, MonthlyReviewSummary } from '../types/api'

function costLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'No cost data'
  return `$${value.toFixed(2)}`
}

function sectionsLabel(item: MonthlyReviewSummary): string {
  const ok = item.metadata?.sections_ok
  const total = item.metadata?.sections_total
  if (ok === undefined || total === undefined) return 'Unknown coverage'
  return `${ok}/${total} sections ok`
}

export function MonthlyReviewPage() {
  const { setPayload, setOpen } = useInspector()
  const [reports, setReports] = useState<MonthlyReviewSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [openingPeriod, setOpeningPeriod] = useState<string | null>(null)
  const [period, setPeriod] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<MonthlyReviewHistoryResponse>('/v1/monthly-review/history?limit=24')
      setReports(response.items ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Monthly Review history could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const query = period.trim() ? `?period=${encodeURIComponent(period.trim())}` : ''
      await apiFetch<MonthlyReviewReport>(`/v1/monthly-review/generate${query}`, { method: 'POST' })
      setPeriod('')
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : 'Monthly Review could not be generated.')
    } finally {
      setGenerating(false)
    }
  }

  async function openReport(item: MonthlyReviewSummary) {
    const targetPeriod = item.metadata?.period || item.source_id
    if (!targetPeriod) return
    setOpeningPeriod(targetPeriod)
    try {
      const report = await apiFetch<MonthlyReviewReport>(`/v1/monthly-review/${encodeURIComponent(targetPeriod)}`)
      setPayload({
        eyebrow: 'Governance',
        title: `Monthly Review \u00b7 ${targetPeriod}`,
        description: `Generated ${formatDate(report.generated_at)} \u00b7 ${report.sections_ok}/${report.sections_total} sections ok`,
        json: report,
      })
      setOpen(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Monthly review for ${targetPeriod} could not be opened.`)
    } finally {
      setOpeningPeriod(null)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Governance</p>
          <h1 className="mt-2 text-xl font-semibold text-white">Monthly Review</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
            Consolidated system health, AI Council/model registry, skills catalogue health, optimisation stats, execution
            review posture, and token usage/cost for each calendar month. Generated automatically on day 1 by MAST
            (hive-monthly-review-generate), or on demand below.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-slate-300">
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4 sm:flex-row sm:items-center">
        <input
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          placeholder="YYYY-MM (defaults to last month)"
          className="h-9 w-full rounded-xl border border-white/10 bg-[#071426] px-3 text-xs text-slate-200 placeholder:text-slate-500 sm:max-w-[220px]"
        />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating}
          className="flex h-9 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-50"
        >
          {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate now
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-300/20 bg-rose-300/8 p-3 text-xs text-rose-200">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading Monthly Review history</div>
        ) : reports.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-8 w-8" />}
            title="No Monthly Review reports yet."
            body="Generate one now, or wait for MAST's hive-monthly-review-generate job to run on day 1 of next month."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {reports.map((item) => {
              const targetPeriod = item.metadata?.period || item.source_id || item.id
              const busy = openingPeriod === targetPeriod
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void openReport(item)}
                  className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038] disabled:opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{targetPeriod}</span>
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin text-cyan-300" /> : <ShieldCheck className="h-4 w-4 text-emerald-300" />}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Generated {formatDate(item.metadata?.generated_at || item.updated_at)}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> {costLabel(item.metadata?.cost_usd_total)}</span>
                    <span>{sectionsLabel(item)}</span>
                  </div>
                  {typeof item.metadata?.open_execution_reviews === 'number' && (
                    <p className="mt-2 text-[11px] text-violet-200">{item.metadata.open_execution_reviews} open execution review(s)</p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
