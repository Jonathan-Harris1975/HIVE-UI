import {
  BadgeCheck,
  BookMarked,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Gavel,
  History,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Star,
  Wand2,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import { MODEL_REGISTRY_CATEGORIES } from '../types/api'
import type {
  RepositoryCouncilHistoryResponse,
  RepositoryCouncilReport,
  RepositoryLearningEntryResponse,
  RepositoryProjectDnaResponse,
  RepositoryQaReport,
} from '../types/api'

const KNOWN_REPOS = ['AIMS', 'HIVE', 'HIVE-UI', 'MAST', 'RAMS', 'Website', 'Shared']

function scorePct(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

function scoreTone(pct: number): string {
  if (pct >= 80) return 'text-emerald-300'
  if (pct >= 50) return 'text-amber-300'
  return 'text-rose-300'
}

export function RepositoryIntelligencePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [repositoryId, setRepositoryId] = useState(searchParams.get('repo') ?? 'HIVE')
  const [repoInput, setRepoInput] = useState(repositoryId)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // QA
  const [qaReport, setQaReport] = useState<RepositoryQaReport | null>(null)
  const [qaRunning, setQaRunning] = useState(false)
  const [qaOpenChecks, setQaOpenChecks] = useState<Set<string>>(new Set())

  // Council
  const [councilReport, setCouncilReport] = useState<RepositoryCouncilReport | null>(null)
  const [councilRunning, setCouncilRunning] = useState(false)
  const [councilHistory, setCouncilHistory] = useState<RepositoryCouncilReport[]>([])
  const [councilHistoryLoading, setCouncilHistoryLoading] = useState(true)

  // Learning
  const [dna, setDna] = useState<RepositoryProjectDnaResponse | null>(null)
  const [dnaRefreshing, setDnaRefreshing] = useState(false)
  const [patchSummary, setPatchSummary] = useState('')
  const [patchSuccess, setPatchSuccess] = useState(true)
  const [patchFiles, setPatchFiles] = useState('')
  const [patchSaving, setPatchSaving] = useState(false)
  const [patternText, setPatternText] = useState('')
  const [patternContext, setPatternContext] = useState('')
  const [patternSaving, setPatternSaving] = useState(false)
  const [preferredCategory, setPreferredCategory] = useState<string>(MODEL_REGISTRY_CATEGORIES[0])
  const [preferredModelId, setPreferredModelId] = useState('')
  const [preferredReason, setPreferredReason] = useState('')
  const [preferredSaving, setPreferredSaving] = useState(false)

  const loadCouncilHistory = useCallback(async (repo: string) => {
    setCouncilHistoryLoading(true)
    try {
      const response = await apiFetch<RepositoryCouncilHistoryResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/council/history`,
      )
      setCouncilHistory(response.runs ?? [])
    } catch {
      setCouncilHistory([])
    } finally {
      setCouncilHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    setQaReport(null)
    setCouncilReport(null)
    setDna(null)
    void loadCouncilHistory(repositoryId)
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('repo', repositoryId)
        return next
      },
      { replace: true },
    )
  }, [repositoryId, loadCouncilHistory, setSearchParams])

  function switchRepository(event: FormEvent) {
    event.preventDefault()
    const next = repoInput.trim()
    if (next) setRepositoryId(next)
  }

  function toggleCheck(name: string) {
    setQaOpenChecks((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function runQa() {
    setQaRunning(true)
    setError(null)
    setNotice(null)
    try {
      const report = await apiFetch<RepositoryQaReport>(`/v1/repositories/${encodeURIComponent(repositoryId)}/qa`, {
        method: 'POST',
      })
      setQaReport(report)
      setNotice(`QA run complete for ${repositoryId}: ${scorePct(report.score)}% (${report.warning_count} warnings).`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository QA failed.')
    } finally {
      setQaRunning(false)
    }
  }

  async function runCouncil() {
    setCouncilRunning(true)
    setError(null)
    setNotice(null)
    try {
      const report = await apiFetch<RepositoryCouncilReport>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/council`,
        { method: 'POST' },
      )
      setCouncilReport(report)
      setNotice(`Council review complete for ${repositoryId}: ${scorePct(report.overall_score)}% overall.`)
      await loadCouncilHistory(repositoryId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository Council review failed.')
    } finally {
      setCouncilRunning(false)
    }
  }

  async function refreshDna() {
    setDnaRefreshing(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<RepositoryProjectDnaResponse>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/learning/refresh-project-dna`,
        { method: 'POST' },
      )
      setDna(response)
      setNotice(`Project DNA refreshed for ${repositoryId}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Project DNA refresh failed.')
    } finally {
      setDnaRefreshing(false)
    }
  }

  async function submitPatchOutcome(event: FormEvent) {
    event.preventDefault()
    if (!patchSummary.trim()) return
    setPatchSaving(true)
    setError(null)
    setNotice(null)
    try {
      const files = patchFiles
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
      await apiFetch<RepositoryLearningEntryResponse>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/learning/patch-outcome`,
        {
          method: 'POST',
          body: JSON.stringify({ summary: patchSummary.trim(), success: patchSuccess, files_changed: files }),
        },
      )
      setNotice('Patch outcome recorded to Repository Memory.')
      setPatchSummary('')
      setPatchFiles('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Patch outcome could not be recorded.')
    } finally {
      setPatchSaving(false)
    }
  }

  async function submitPattern(event: FormEvent) {
    event.preventDefault()
    if (!patternText.trim()) return
    setPatternSaving(true)
    setError(null)
    setNotice(null)
    try {
      await apiFetch<RepositoryLearningEntryResponse>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/learning/coding-pattern`,
        { method: 'POST', body: JSON.stringify({ pattern: patternText.trim(), context: patternContext.trim() }) },
      )
      setNotice('Coding pattern recorded to Repository Memory.')
      setPatternText('')
      setPatternContext('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Coding pattern could not be recorded.')
    } finally {
      setPatternSaving(false)
    }
  }

  async function submitPreferredModel(event: FormEvent) {
    event.preventDefault()
    if (!preferredModelId.trim()) return
    setPreferredSaving(true)
    setError(null)
    setNotice(null)
    try {
      await apiFetch<RepositoryLearningEntryResponse>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/learning/preferred-model`,
        {
          method: 'POST',
          body: JSON.stringify({
            category: preferredCategory,
            model_id: preferredModelId.trim(),
            reason: preferredReason.trim(),
          }),
        },
      )
      setNotice(`Preferred model recorded for ${repositoryId}: ${preferredModelId.trim()} (${preferredCategory}).`)
      setPreferredModelId('')
      setPreferredReason('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preferred model could not be recorded.')
    } finally {
      setPreferredSaving(false)
    }
  }

  const qaOverallPct = qaReport ? scorePct(qaReport.score) : null
  const councilOverallPct = councilReport ? scorePct(councilReport.overall_score) : null

  const recentHistory = useMemo(() => councilHistory.slice(-5).reverse(), [councilHistory])

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Repository intelligence</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">QA, Council review &amp; learned patterns</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Static QA checks, weighted Council scoring, and the learning signals repositories accumulate over time —
            all scoped to a single registered repository.
          </p>

          <form onSubmit={switchRepository} className="mt-6 grid gap-2 border-t border-white/8 pt-5 sm:grid-cols-[1fr_220px_auto]">
            <label className="relative">
              <Database className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                list="known-repos-intel"
                placeholder="Repository id (e.g. HIVE)"
                className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-400 focus:border-cyan-300/30"
              />
              <datalist id="known-repos-intel">
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
        </section>

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

        {/* QA */}
        <section className="mt-6 rounded-3xl border border-white/8 bg-[#0a192d]/70 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldAlert className="h-4 w-4 text-cyan-300" /> Repository QA</h3>
            <button
              type="button"
              onClick={() => void runQa()}
              disabled={qaRunning}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-medium text-cyan-100 disabled:opacity-50"
            >
              {qaRunning ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Run QA
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Static checks only — build compilation, lint heuristics, import validation, dependency scan, dead-code
            detection, secret-pattern scanning, patch-drift and architecture smells. Nothing here installs
            dependencies or executes the repository's own tests.
          </p>

          {!qaReport ? (
            <div className="mt-4">
              <EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="No QA run yet for this repository." body="Run QA to generate a fresh report." />
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-semibold ${scoreTone(qaOverallPct ?? 0)}`}>{qaOverallPct}%</span>
                <span className="text-xs text-slate-400">{qaReport.warning_count} warning{qaReport.warning_count === 1 ? '' : 's'} across {qaReport.checks.length} checks</span>
              </div>
              <div className="mt-3 space-y-2">
                {qaReport.checks.map((check) => {
                  const open = qaOpenChecks.has(check.name)
                  return (
                    <div key={check.name} className="rounded-xl border border-white/8 bg-white/[0.025]">
                      <button
                        type="button"
                        onClick={() => toggleCheck(check.name)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      >
                        <span className="flex items-center gap-2 text-xs font-medium text-slate-100">
                          {check.status === 'ok' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                          ) : check.status === 'skipped' ? (
                            <XCircle className="h-3.5 w-3.5 text-slate-500" />
                          ) : (
                            <ShieldAlert className="h-3.5 w-3.5 text-amber-300" />
                          )}
                          {check.name.replace(/_/g, ' ')}
                        </span>
                        <span className="flex items-center gap-2">
                          <StatusBadge status={check.status} compact />
                          {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                        </span>
                      </button>
                      {open && (
                        <div className="border-t border-white/6 px-3 py-2.5 text-xs leading-5 text-slate-400">
                          <p>{check.summary}</p>
                          {Object.keys(check.details).length > 0 && (
                            <pre className="mt-2 overflow-x-auto rounded-lg bg-[#061126] p-2 font-mono text-[11px] text-slate-400">
                              {JSON.stringify(check.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* Council */}
        <section className="mt-6 rounded-3xl border border-white/8 bg-[#0a192d]/70 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Gavel className="h-4 w-4 text-cyan-300" /> Repository Council</h3>
            <button
              type="button"
              onClick={() => void runCouncil()}
              disabled={councilRunning}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-medium text-cyan-100 disabled:opacity-50"
            >
              {councilRunning ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />} Run review
            </button>
          </div>

          {!councilReport ? (
            <div className="mt-4">
              <EmptyState icon={<Gavel className="h-5 w-5" />} title="No Council review recorded for this session." body="Run a review to score architecture, security, maintainability and more." />
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-2xl font-semibold ${scoreTone(councilOverallPct ?? 0)}`}>{councilOverallPct}%</span>
                <span className="text-xs text-slate-400">overall, {formatDate(councilReport.occurred_at)}</span>
                {councilReport.has_unmeasured_signal && (
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2.5 py-1 text-[11px] text-amber-200">
                    Includes heuristic (unmeasured) dimensions
                  </span>
                )}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {councilReport.dimensions.map((dim) => (
                  <div key={dim.dimension} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-100">{dim.dimension.replace(/_/g, ' ')}</span>
                      <span className="flex items-center gap-1.5">
                        {dim.confidence === 'heuristic' && (
                          <span title="Heuristic placeholder, not measured signal" className="text-[10px] text-amber-300">heuristic</span>
                        )}
                        <span className={`text-xs font-semibold ${scoreTone(scorePct(dim.score))}`}>{scorePct(dim.score)}%</span>
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">{dim.rationale}</p>
                  </div>
                ))}
              </div>
              {councilReport.recommendations.length > 0 && (
                <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
                  <p className="text-xs font-semibold text-cyan-100">Recommendations</p>
                  <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-5 text-slate-300">
                    {councilReport.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 border-t border-white/8 pt-4">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400"><History className="h-3.5 w-3.5" /> Recent history</h4>
            {councilHistoryLoading ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading history</div>
            ) : recentHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No prior Council runs recorded for {repositoryId}.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {recentHistory.map((run, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border border-white/6 bg-white/[0.02] px-3 py-1.5 text-xs">
                    <span className="text-slate-400">{formatDate(run.occurred_at)}</span>
                    <span className={`font-semibold ${scoreTone(scorePct(run.overall_score))}`}>{scorePct(run.overall_score)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Learning */}
        <section className="mt-6 rounded-3xl border border-white/8 bg-[#0a192d]/70 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Brain className="h-4 w-4 text-cyan-300" /> Learning</h3>
            <button
              type="button"
              onClick={() => void refreshDna()}
              disabled={dnaRefreshing}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07] disabled:opacity-50"
            >
              {dnaRefreshing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Refresh project DNA
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Recording a patch outcome or coding pattern appends to this repository's Repository Memory. Refreshing
            project DNA rolls those up into a summary.
          </p>

          {dna && (
            <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3 text-xs leading-5 text-emerald-100">
              <p><span className="font-semibold">Patch summary:</span> {dna.patch_summary || 'None yet.'}</p>
              <p className="mt-1"><span className="font-semibold">Pattern summary:</span> {dna.pattern_summary || 'None yet.'}</p>
              <p className="mt-1 flex flex-wrap gap-3 text-slate-300">
                <span>Latest QA score: {dna.latest_qa_score != null ? `${scorePct(Number(dna.latest_qa_score))}%` : '—'}</span>
                <span>Latest Council score: {dna.latest_council_score != null ? `${scorePct(Number(dna.latest_council_score))}%` : '—'}</span>
              </p>
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <form onSubmit={submitPatchOutcome} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"><BadgeCheck className="h-3.5 w-3.5" /> Record patch outcome</h4>
              <textarea
                value={patchSummary}
                onChange={(event) => setPatchSummary(event.target.value)}
                placeholder="What did the patch do?"
                rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-white/8 bg-[#071426] px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <input
                value={patchFiles}
                onChange={(event) => setPatchFiles(event.target.value)}
                placeholder="Files changed (comma or newline separated)"
                className="mt-2 h-9 w-full rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={patchSuccess} onChange={(event) => setPatchSuccess(event.target.checked)} className="h-3.5 w-3.5 rounded border-white/20 bg-transparent" />
                  Successful
                </label>
                <button
                  type="submit"
                  disabled={patchSaving || !patchSummary.trim()}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-50"
                >
                  {patchSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />} Record
                </button>
              </div>
            </form>

            <form onSubmit={submitPattern} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"><Wand2 className="h-3.5 w-3.5" /> Record coding pattern</h4>
              <input
                value={patternText}
                onChange={(event) => setPatternText(event.target.value)}
                placeholder="Pattern (e.g. 'repositories use apiFetch, not raw fetch')"
                className="mt-2 h-9 w-full rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <textarea
                value={patternContext}
                onChange={(event) => setPatternContext(event.target.value)}
                placeholder="Context (optional)"
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-white/8 bg-[#071426] px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={patternSaving || !patternText.trim()}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-50"
                >
                  {patternSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BookMarked className="h-3.5 w-3.5" />} Record
                </button>
              </div>
            </form>

            <form onSubmit={submitPreferredModel} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"><Star className="h-3.5 w-3.5" /> Record preferred model</h4>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Captures this repository's observed model preference as a learned pattern. Doesn't change the global
                Model Registry ranking — see the Model Registry page for that.
              </p>
              <select
                value={preferredCategory}
                onChange={(event) => setPreferredCategory(event.target.value)}
                className="mt-2 h-9 w-full rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-100 outline-none focus:border-cyan-300/30"
              >
                {MODEL_REGISTRY_CATEGORIES.map((item) => (
                  <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <input
                value={preferredModelId}
                onChange={(event) => setPreferredModelId(event.target.value)}
                placeholder="Model id (e.g. anthropic/claude-sonnet-5)"
                className="mt-2 h-9 w-full rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <textarea
                value={preferredReason}
                onChange={(event) => setPreferredReason(event.target.value)}
                placeholder="Why this model works well here (optional)"
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-white/8 bg-[#071426] px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={preferredSaving || !preferredModelId.trim()}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-50"
                >
                  {preferredSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />} Record
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
