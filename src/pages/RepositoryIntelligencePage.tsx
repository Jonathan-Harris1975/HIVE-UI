import {
  BadgeCheck,
  BookMarked,
  Brain,
  CheckCircle2,
  Copy,
  Download,
  ChevronDown,
  ChevronUp,
  Gavel,
  History,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Star,
  Wand2,
  Wrench,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { RepositoryMemoryPage } from './RepositoryMemoryPage'
import { StatusBadge } from '../components/StatusBadge'
import { useRepositoryCatalog } from '../hooks/useRepositoryCatalog'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import { MODEL_REGISTRY_CATEGORIES } from '../types/api'
import type {
  RepositoryCouncilHistoryResponse,
  RepositoryCouncilReport,
  RepositoryLearningEntryResponse,
  RepositoryIntelligenceReport,
  RepositoryImprovementJob,
  RepositoryImprovementLatestResponse,
  RepositoryMemoryResponse,
  RepositoryProjectDnaResponse,
  RepositoryQaReport,
} from '../types/api'

function scorePct(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

function scoreTone(pct: number): string {
  if (pct >= 80) return 'text-emerald-300'
  if (pct >= 50) return 'text-amber-300'
  return 'text-rose-300'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asQaReport(value: unknown): RepositoryQaReport | null {
  if (!isRecord(value)) return null
  if (typeof value.repository_id !== 'string') return null
  if (typeof value.score !== 'number' || typeof value.warning_count !== 'number') return null
  if (!Array.isArray(value.checks)) return null
  return value as unknown as RepositoryQaReport
}

function asProjectDna(value: unknown): RepositoryProjectDnaResponse | null {
  return isRecord(value) ? (value as RepositoryProjectDnaResponse) : null
}

type PersistedIntelligence = {
  occurred_at?: string
  summary: RepositoryIntelligenceReport['summary']
  repository_context?: RepositoryIntelligenceReport['repository_context']
  findings: RepositoryIntelligenceReport['findings']
  improvement_prompt: string
}

function asPersistedIntelligence(value: unknown): PersistedIntelligence | null {
  if (!isRecord(value) || !isRecord(value.summary) || !Array.isArray(value.findings)) return null
  if (typeof value.improvement_prompt !== 'string') return null
  return {
    occurred_at: typeof value.occurred_at === 'string' ? value.occurred_at : undefined,
    summary: value.summary as unknown as RepositoryIntelligenceReport['summary'],
    repository_context: isRecord(value.repository_context)
      ? (value.repository_context as unknown as RepositoryIntelligenceReport['repository_context'])
      : undefined,
    findings: value.findings as RepositoryIntelligenceReport['findings'],
    improvement_prompt: value.improvement_prompt,
  }
}

export function RepositoryIntelligencePage() {
  const catalog = useRepositoryCatalog()
  const [searchParams, setSearchParams] = useSearchParams()
  const [repositoryId, setRepositoryId] = useState(searchParams.get('repo') ?? '')
  const [repoInput, setRepoInput] = useState(repositoryId)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Canonical combined QA + Council Repository Intelligence run.
  const [intelligence, setIntelligence] = useState<PersistedIntelligence | null>(null)
  const [intelligenceRunning, setIntelligenceRunning] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [improvementJob, setImprovementJob] = useState<RepositoryImprovementJob | null>(null)
  const [improvementStarting, setImprovementStarting] = useState(false)

  // Raw QA/Council evidence remains visible below the consolidated report.
  const [qaReport, setQaReport] = useState<RepositoryQaReport | null>(null)
  const [qaOpenChecks, setQaOpenChecks] = useState<Set<string>>(new Set())

  const [councilReport, setCouncilReport] = useState<RepositoryCouncilReport | null>(null)
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

  useEffect(() => {
    if (catalog.loading || catalog.repositories.length === 0) return
    if (repositoryId && catalog.repositories.some((repo) => repo.repository_id === repositoryId)) return
    const preferred = catalog.repositories.find((repo) => repo.repository_id === 'HIVE') ?? catalog.repositories[0]
    setRepositoryId(preferred.repository_id)
    setRepoInput(preferred.repository_id)
  }, [catalog.loading, catalog.repositories, repositoryId])

  const loadCouncilHistory = useCallback(async (repo: string) => {
    setCouncilHistoryLoading(true)
    try {
      const response = await apiFetch<RepositoryCouncilHistoryResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/council/history`,
      )
      const runs = response.runs ?? []
      setCouncilHistory(runs)
      setCouncilReport(runs.length > 0 ? runs[runs.length - 1] : null)
    } catch (caught) {
      setCouncilHistory([])
      setError(caught instanceof Error ? caught.message : 'Repository Council history could not be loaded.')
    } finally {
      setCouncilHistoryLoading(false)
    }
  }, [])

  const loadPersistentIntelligence = useCallback(async (repo: string) => {
    try {
      const response = await apiFetch<RepositoryMemoryResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/memory`,
      )
      const qaHistory = Array.isArray(response.memory?.qa_history) ? response.memory.qa_history : []
      const latestQa = [...qaHistory].reverse().map(asQaReport).find((entry) => entry !== null) ?? null
      const intelligenceHistory = Array.isArray(response.memory?.repository_intelligence_history)
        ? response.memory.repository_intelligence_history
        : []
      const latestIntelligence = [...intelligenceHistory]
        .reverse()
        .map(asPersistedIntelligence)
        .find((entry) => entry !== null) ?? null
      setQaReport(latestQa)
      setIntelligence(latestIntelligence)
      setDna(asProjectDna(response.memory?.project_dna))
    } catch (caught) {
      setQaReport(null)
      setIntelligence(null)
      setDna(null)
      setError(caught instanceof Error ? caught.message : 'Persisted Repository Intelligence could not be loaded.')
    }
  }, [])

  const loadLatestImprovement = useCallback(async (repo: string) => {
    try {
      const response = await apiFetch<RepositoryImprovementLatestResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/improvements/latest`,
      )
      setImprovementJob(response.job ?? null)
    } catch {
      setImprovementJob(null)
    }
  }, [])

  useEffect(() => {
    if (!repositoryId || catalog.loading) return
    if (!catalog.repositories.some((repo) => repo.repository_id === repositoryId)) return
    setQaReport(null)
    setCouncilReport(null)
    setIntelligence(null)
    setDna(null)
    setImprovementJob(null)
    void loadCouncilHistory(repositoryId)
    void loadPersistentIntelligence(repositoryId)
    void loadLatestImprovement(repositoryId)
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('repo', repositoryId)
        return next
      },
      { replace: true },
    )
  }, [
    repositoryId,
    catalog.loading,
    catalog.repositories,
    loadCouncilHistory,
    loadPersistentIntelligence,
    loadLatestImprovement,
    setSearchParams,
  ])


  useEffect(() => {
    if (!repositoryId || !improvementJob || !['accepted', 'running'].includes(improvementJob.status)) return undefined
    let cancelled = false
    const timer = window.setInterval(() => {
      void apiFetch<RepositoryImprovementJob>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/improvements/jobs/${encodeURIComponent(improvementJob.job_id)}`,
      ).then((job) => {
        if (cancelled) return
        setImprovementJob(job)
        if (job.status === 'completed') {
          void loadPersistentIntelligence(repositoryId)
          setNotice(`Automatic improvements completed for ${repositoryId}: ${job.change_count ?? 0} file change(s) ready to download.`)
        } else if (job.status === 'failed') {
          setError(job.error || 'Automatic repository improvements failed.')
        }
      }).catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Improvement status could not be refreshed.')
      })
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [improvementJob, repositoryId, loadPersistentIntelligence])

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

  async function runIntelligence() {
    setIntelligenceRunning(true)
    setError(null)
    setNotice(null)
    setPromptCopied(false)
    try {
      const report = await apiFetch<RepositoryIntelligenceReport>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/intelligence/run`,
        { method: 'POST' },
      )
      setIntelligence({
        occurred_at: report.occurred_at,
        summary: report.summary,
        repository_context: report.repository_context,
        findings: report.findings,
        improvement_prompt: report.improvement_prompt,
      })
      setQaReport(report.qa)
      setCouncilReport(report.council)
      setDna(report.project_dna)
      await Promise.all([loadCouncilHistory(repositoryId), loadPersistentIntelligence(repositoryId)])
      setNotice(`Repository Intelligence complete for ${repositoryId}: ${report.summary.finding_count} consolidated finding(s).`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository Intelligence failed.')
    } finally {
      setIntelligenceRunning(false)
    }
  }

  async function copyImprovementPrompt() {
    if (!intelligence?.improvement_prompt) return
    try {
      await navigator.clipboard.writeText(intelligence.improvement_prompt)
      setPromptCopied(true)
      window.setTimeout(() => setPromptCopied(false), 1800)
    } catch {
      setError('The improvement prompt could not be copied to the clipboard.')
    }
  }

  async function startImprovements() {
    setImprovementStarting(true)
    setError(null)
    setNotice(null)
    try {
      const job = await apiFetch<RepositoryImprovementJob>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/improvements/run`,
        { method: 'POST' },
      )
      setImprovementJob(job)
      setNotice(`Automatic improvements queued for ${repositoryId}. HIVE is working on an isolated copy.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Automatic repository improvements could not be started.')
    } finally {
      setImprovementStarting(false)
    }
  }

  function improvementDownloadUrl(kind: 'changed_files' | 'updated_repository'): string | null {
    if (!improvementJob || improvementJob.status !== 'completed') return null
    return `/api/v1/repositories/${encodeURIComponent(repositoryId)}/improvements/jobs/${encodeURIComponent(improvementJob.job_id)}/download/${kind}`
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
      await loadPersistentIntelligence(repositoryId)
      setNotice('Patch outcome recorded to Repository Memory and Project DNA refreshed.')
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
      await loadPersistentIntelligence(repositoryId)
      setNotice('Coding pattern recorded to Repository Memory and Project DNA refreshed.')
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
      await loadPersistentIntelligence(repositoryId)
      setNotice(`Preferred model recorded for ${repositoryId}: ${preferredModelId.trim()} (${preferredCategory}); Project DNA refreshed.`)
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
  const selectedRepository = catalog.repositories.find((repo) => repo.repository_id === repositoryId)
  const repositoryReady = Boolean(
    selectedRepository && !selectedRepository.rehydrated && selectedRepository.memory_ready,
  )
  const repositoryUnavailable = Boolean(repositoryId) && !catalog.loading && !selectedRepository
  const intelligenceCurrent = Boolean(
    intelligence?.repository_context?.fingerprint
      && selectedRepository?.fingerprint
      && intelligence.repository_context.fingerprint === selectedRepository.fingerprint,
  )
  const hasImprovementFindings = Boolean((intelligence?.summary.finding_count ?? 0) > 0)

  const recentHistory = useMemo(() => councilHistory.slice(-5).reverse(), [councilHistory])

  return (
    <div className="h-full overflow-x-hidden overflow-y-auto p-3 sm:p-6 lg:p-8">
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-hive-panel/75 p-4 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Repository workspace</p>
          <h2 className="mt-2 break-words text-xl font-semibold text-white sm:text-2xl">Memory &amp; Repository Intelligence</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            One governed workspace for persistent Repository Memory, QA evidence, Council scoring, consolidated findings and code-improvement instructions.
          </p>

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
            <button type="submit" disabled={!repoInput} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-hive-accent-deep disabled:opacity-50 sm:w-auto">
              Load
            </button>
          </form>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void runIntelligence()}
              disabled={intelligenceRunning || !repositoryReady}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {intelligenceRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Run Repository Intelligence
            </button>
            <button
              type="button"
              onClick={() => void startImprovements()}
              disabled={improvementStarting || !repositoryReady || !intelligenceCurrent || !hasImprovementFindings || Boolean(improvementJob && ['accepted', 'running'].includes(improvementJob.status))}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {improvementStarting || (improvementJob && ['accepted', 'running'].includes(improvementJob.status)) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              {improvementJob && ['accepted', 'running'].includes(improvementJob.status)
                ? 'Improving repository…'
                : intelligenceCurrent && !hasImprovementFindings
                  ? 'No improvements required'
                  : 'Carry out improvements'}
            </button>
          </div>
        </section>

        {catalog.error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{catalog.error}</div>}
        {!catalog.loading && catalog.repositories.length === 0 && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
            No repository snapshots are registered. Upload the governed repositories on Overview before running Intelligence.
          </div>
        )}
        {repositoryUnavailable && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
            {repositoryId} is not registered in HIVE. Choose a registered repository or upload its ZIP on Overview.
          </div>
        )}
        {selectedRepository?.rehydrated && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
            {repositoryId} has legacy manifest metadata but no durable source snapshot. Re-upload it once on Overview; future restarts will restore the working copy from R2 automatically.
          </div>
        )}
        {selectedRepository?.memory_status === 'unavailable' && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">
            Repository Memory persistence is unavailable for {repositoryId}. Intelligence writes are blocked until D1 is healthy; use Retry setup on Overview after recovery.
          </div>
        )}
        {selectedRepository && !selectedRepository.rehydrated && selectedRepository.memory_status !== 'unavailable' && !selectedRepository.memory_ready && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
            Repository setup is incomplete for {repositoryId}. QA, Council and learning writes are blocked until Memory and Intelligence are ready. Use Retry setup on Overview.
          </div>
        )}

        {intelligence && !intelligenceCurrent && repositoryReady && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
            This Intelligence report predates the repository-specific snapshot contract or belongs to an older snapshot. Run Repository Intelligence again before automatic improvements.
          </div>
        )}

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

        {/* Consolidated Intelligence */}
        <section className="mt-6 min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-hive-panel/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-cyan-300" /> Consolidated improvement report</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">One evidence set from Repository QA and Repository Council, merged without rerunning QA.</p>
            </div>
            {intelligence?.improvement_prompt && (
              <button type="button" onClick={() => void copyImprovementPrompt()} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-200 hover:bg-white/[0.07]">
                <Copy className="h-3.5 w-3.5" /> {promptCopied ? 'Copied' : 'Copy improvement prompt'}
              </button>
            )}
          </div>

          {!intelligence ? (
            <div className="mt-4">
              <EmptyState icon={<Sparkles className="h-5 w-5" />} title="No consolidated Intelligence report yet." body="Run Repository Intelligence to combine QA and Council evidence into one prioritised improvement report and coding prompt." />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><p className="text-xs text-slate-500">QA score</p><p className={`mt-1 text-xl font-semibold ${scoreTone(scorePct(intelligence.summary.qa_score))}`}>{scorePct(intelligence.summary.qa_score)}%</p></div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><p className="text-xs text-slate-500">Council score</p><p className={`mt-1 text-xl font-semibold ${scoreTone(scorePct(intelligence.summary.council_score))}`}>{scorePct(intelligence.summary.council_score)}%</p></div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><p className="text-xs text-slate-500">Findings</p><p className="mt-1 text-xl font-semibold text-white">{intelligence.summary.finding_count}</p></div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><p className="text-xs text-slate-500">Critical/high</p><p className={`mt-1 text-xl font-semibold ${intelligence.summary.blocking_finding_count ? 'text-rose-300' : 'text-emerald-300'}`}>{intelligence.summary.blocking_finding_count}</p></div>
              </div>
              <div className="rounded-xl border border-white/8 bg-hive-surface/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-100">{intelligence.summary.headline}</p>
                  <StatusBadge status={intelligence.summary.status === 'healthy' ? 'ready' : intelligence.summary.status === 'action_required' ? 'error' : 'warning'} label={intelligence.summary.status.replace(/_/g, ' ')} compact />
                </div>
                {intelligence.occurred_at && <p className="mt-1 text-xs text-slate-500">{formatDate(intelligence.occurred_at)}</p>}
              </div>
              {intelligence.repository_context && (
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-xs font-semibold text-slate-200">Repository snapshot used for this report</p>
                  <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                    <p className="break-all"><span className="text-slate-500">Snapshot:</span> {intelligence.repository_context.source_filename}</p>
                    <p><span className="text-slate-500">Files:</span> {intelligence.repository_context.file_count}</p>
                    <p className="break-words"><span className="text-slate-500">Languages:</span> {Object.keys(intelligence.repository_context.languages || {}).join(', ') || 'Unknown'}</p>
                    <p><span className="text-slate-500">Dependency manifests:</span> {intelligence.repository_context.dependency_manifests?.length ?? 0}</p>
                  </div>
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-500">{intelligence.repository_context.fingerprint}</p>
                </div>
              )}
              {intelligence.findings.length === 0 ? (
                <p className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3 text-xs text-emerald-100">No QA warnings or sub-target Council dimensions were reported.</p>
              ) : (
                <div className="space-y-2">
                  {intelligence.findings.map((finding) => (
                    <article key={finding.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-100">{finding.title}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${finding.severity === 'critical' || finding.severity === 'high' ? 'border-rose-300/20 bg-rose-300/8 text-rose-200' : 'border-amber-300/20 bg-amber-300/8 text-amber-100'}`}>{finding.severity}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{finding.summary}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{finding.source.replace(/_/g, ' ')} · {finding.category.replace(/_/g, ' ')} · {finding.confidence}</p>
                      {Object.keys(finding.details ?? {}).length > 0 && <pre className="mt-2 max-h-56 max-w-full overflow-auto rounded-lg bg-hive-canvas p-2 font-mono text-[11px] text-slate-400">{JSON.stringify(finding.details, null, 2)}</pre>}
                    </article>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
                <p className="text-xs font-semibold text-cyan-100">Code-improvement prompt</p>
                <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-300">{intelligence.improvement_prompt}</pre>
              </div>
            </div>
          )}
        </section>

        {improvementJob && (
          <section className="mt-6 min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-hive-panel/70 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Wrench className="h-4 w-4 text-emerald-300" /> Automatic improvements</h3>
                <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                  Job {improvementJob.job_id.slice(0, 10)} · {improvementJob.stage || improvementJob.status}
                  {improvementJob.model_used ? ` · ${improvementJob.model_used}` : ''}
                </p>
              </div>
              <StatusBadge status={improvementJob.status === 'completed' ? 'ready' : improvementJob.status === 'failed' ? 'error' : 'running'} label={improvementJob.status.replace(/_/g, ' ')} compact />
            </div>
            {improvementJob.summary && <p className="mt-3 text-sm leading-6 text-slate-300">{improvementJob.summary}</p>}
            {improvementJob.error && <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/8 p-3 text-xs leading-5 text-rose-200">{improvementJob.error}</p>}
            {improvementJob.status === 'completed' && (
              <div className="mt-4">
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 px-2.5 py-1">{improvementJob.change_count ?? 0} file change(s)</span>
                  {typeof improvementJob.qa_score_after === 'number' && <span className="rounded-full border border-emerald-300/15 bg-emerald-300/7 px-2.5 py-1 text-emerald-100">Static QA after: {scorePct(improvementJob.qa_score_after)}%</span>}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {improvementDownloadUrl('changed_files') && (
                    <a href={improvementDownloadUrl('changed_files') ?? undefined} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100">
                      <Download className="h-4 w-4" /> Download changed files
                    </a>
                  )}
                  {improvementDownloadUrl('updated_repository') && (
                    <a href={improvementDownloadUrl('updated_repository') ?? undefined} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-100">
                      <Download className="h-4 w-4" /> Download updated repository
                    </a>
                  )}
                </div>
                {improvementJob.remaining_risks && improvementJob.remaining_risks.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
                    <p className="text-xs font-semibold text-amber-100">Remaining verification</p>
                    <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-5 text-slate-300">
                      {improvementJob.remaining_risks.map((risk, index) => <li key={index}>{risk}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* QA */}
        <section className="mt-6 min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-hive-panel/70 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldAlert className="h-4 w-4 text-cyan-300" /> Repository QA evidence</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Static checks only — build compilation, lint heuristics, import validation, dependency scan, dead-code
            detection, secret-pattern scanning, patch-drift and architecture smells. Nothing here installs
            dependencies or executes the repository's own tests.
          </p>

          {!qaReport ? (
            <div className="mt-4">
              <EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="No QA evidence recorded for this repository." body="Run Repository Intelligence to generate QA evidence and the consolidated report." />
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
                            <pre className="mt-2 overflow-x-auto rounded-lg bg-hive-canvas p-2 font-mono text-xs text-slate-400">
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
        <section className="mt-6 min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-hive-panel/70 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Gavel className="h-4 w-4 text-cyan-300" /> Repository Council evidence</h3>
          </div>

          {!councilReport ? (
            <div className="mt-4">
              <EmptyState icon={<Gavel className="h-5 w-5" />} title="No Council evidence recorded for this repository." body="Run Repository Intelligence to score architecture, security, maintainability and the other Council dimensions." />
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-2xl font-semibold ${scoreTone(councilOverallPct ?? 0)}`}>{councilOverallPct}%</span>
                <span className="text-xs text-slate-400">overall, {formatDate(councilReport.occurred_at)}</span>
                {councilReport.has_unmeasured_signal && (
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2.5 py-1 text-xs text-amber-200">
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
                          <span title="Heuristic proxy, not measured signal" className="text-xs text-amber-300">heuristic</span>
                        )}
                        <span className={`text-xs font-semibold ${scoreTone(scorePct(dim.score))}`}>{scorePct(dim.score)}%</span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-4 text-slate-500">{dim.rationale}</p>
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
        <section className="mt-6 min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-hive-panel/70 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Brain className="h-4 w-4 text-cyan-300" /> Learning</h3>
            <button
              type="button"
              onClick={() => void refreshDna()}
              disabled={dnaRefreshing || !repositoryReady}
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
                aria-label="Patch summary"
                rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-white/8 bg-hive-surface px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <input
                value={patchFiles}
                onChange={(event) => setPatchFiles(event.target.value)}
                placeholder="Files changed (comma or newline separated)"
                aria-label="Files changed"
                className="mt-2 h-9 w-full rounded-lg border border-white/8 bg-hive-surface px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={patchSuccess} onChange={(event) => setPatchSuccess(event.target.checked)} className="h-3.5 w-3.5 rounded border-white/20 bg-transparent" />
                  Successful
                </label>
                <button
                  type="submit"
                  disabled={patchSaving || !patchSummary.trim() || !repositoryReady}
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
                aria-label="Coding pattern"
                className="mt-2 h-9 w-full rounded-lg border border-white/8 bg-hive-surface px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <textarea
                value={patternContext}
                onChange={(event) => setPatternContext(event.target.value)}
                placeholder="Context (optional)"
                aria-label="Pattern context"
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-white/8 bg-hive-surface px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={patternSaving || !patternText.trim() || !repositoryReady}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-50"
                >
                  {patternSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BookMarked className="h-3.5 w-3.5" />} Record
                </button>
              </div>
            </form>

            <form onSubmit={submitPreferredModel} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"><Star className="h-3.5 w-3.5" /> Record preferred model</h4>
              <p className="mt-1 text-xs leading-4 text-slate-500">
                Captures this repository's observed model preference as a learned pattern. Doesn't change the global
                Model Registry ranking — see the Model Registry page for that.
              </p>
              <select
                value={preferredCategory}
                aria-label="Preferred model category"
                onChange={(event) => setPreferredCategory(event.target.value)}
                className="mt-2 h-9 w-full rounded-lg border border-white/8 bg-hive-surface px-3 text-xs text-slate-100 outline-none focus:border-cyan-300/30"
              >
                {MODEL_REGISTRY_CATEGORIES.map((item) => (
                  <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <input
                value={preferredModelId}
                onChange={(event) => setPreferredModelId(event.target.value)}
                placeholder="Model id (e.g. anthropic/claude-sonnet-5)"
                aria-label="Preferred model id"
                className="mt-2 h-9 w-full rounded-lg border border-white/8 bg-hive-surface px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <textarea
                value={preferredReason}
                onChange={(event) => setPreferredReason(event.target.value)}
                placeholder="Why this model works well here (optional)"
                aria-label="Preferred model reason"
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-white/8 bg-hive-surface px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={preferredSaving || !preferredModelId.trim() || !repositoryReady}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-50"
                >
                  {preferredSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />} Record
                </button>
              </div>
            </form>
          </div>
        </section>

        <RepositoryMemoryPage embedded />
      </div>
    </div>
  )
}
