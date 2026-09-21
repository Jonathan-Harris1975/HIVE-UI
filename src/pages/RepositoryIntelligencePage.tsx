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
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
  RepositoryImprovementExecutionMode,
  RepositoryImprovementJob,
  RepositoryImprovementRunRequest,
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
  repository_id: string
  occurred_at?: string
  summary: RepositoryIntelligenceReport['summary']
  repository_context?: RepositoryIntelligenceReport['repository_context']
  findings: RepositoryIntelligenceReport['findings']
  improvement_prompt: string
}

function asPersistedIntelligence(value: unknown, expectedRepositoryId: string): PersistedIntelligence | null {
  if (!isRecord(value) || !isRecord(value.summary) || !Array.isArray(value.findings)) return null
  if (value.repository_id !== expectedRepositoryId || value.summary.repository_id !== expectedRepositoryId) return null
  if (typeof value.improvement_prompt !== 'string') return null
  const context = isRecord(value.repository_context) ? value.repository_context : null
  if (context && context.repository_id !== expectedRepositoryId) return null
  return {
    repository_id: expectedRepositoryId,
    occurred_at: typeof value.occurred_at === 'string' ? value.occurred_at : undefined,
    summary: value.summary as unknown as RepositoryIntelligenceReport['summary'],
    repository_context: context
      ? (context as unknown as RepositoryIntelligenceReport['repository_context'])
      : undefined,
    findings: value.findings as RepositoryIntelligenceReport['findings'],
    improvement_prompt: value.improvement_prompt,
  }
}

export function RepositoryIntelligencePage() {
  const catalog = useRepositoryCatalog()
  const [searchParams, setSearchParams] = useSearchParams()
  const [repositoryId, setRepositoryId] = useState(searchParams.get('repo') ?? '')
  const activeRepositoryRef = useRef(repositoryId)
  const improvementPollCount = useRef(0)
  const selectRepository = useCallback((nextRepositoryId: string) => {
    activeRepositoryRef.current = nextRepositoryId
    setRepositoryId(nextRepositoryId)
  }, [])

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Canonical combined QA + Council Repository Intelligence run.
  const [intelligence, setIntelligence] = useState<PersistedIntelligence | null>(null)
  const [intelligenceRunning, setIntelligenceRunning] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [improvementJob, setImprovementJob] = useState<RepositoryImprovementJob | null>(null)
  const [improvementStarting, setImprovementStarting] = useState(false)
  const [executionMode, setExecutionMode] = useState<RepositoryImprovementExecutionMode>('multi_pass')
  const [maxWorkPasses, setMaxWorkPasses] = useState(4)
  const [improvementCancelling, setImprovementCancelling] = useState(false)
  const [setupRepairing, setSetupRepairing] = useState(false)

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
    selectRepository(preferred.repository_id)
  }, [catalog.loading, catalog.repositories, repositoryId, selectRepository])

  const loadCouncilHistory = useCallback(async (repo: string) => {
    if (activeRepositoryRef.current === repo) setCouncilHistoryLoading(true)
    try {
      const response = await apiFetch<RepositoryCouncilHistoryResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/council/history`,
      )
      if (activeRepositoryRef.current !== repo) return
      if (response.repository_id !== repo) throw new Error(`Repository Council returned data for ${response.repository_id}, not ${repo}.`)
      const runs = (response.runs ?? []).filter((run) => run.repository_id === repo)
      setCouncilHistory(runs)
      setCouncilReport(runs.length > 0 ? runs[runs.length - 1] : null)
    } catch (caught) {
      if (activeRepositoryRef.current !== repo) return
      setCouncilHistory([])
      setError(caught instanceof Error ? caught.message : 'Repository Council history could not be loaded.')
    } finally {
      if (activeRepositoryRef.current === repo) setCouncilHistoryLoading(false)
    }
  }, [])

  const loadPersistentIntelligence = useCallback(async (repo: string) => {
    try {
      const response = await apiFetch<RepositoryMemoryResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/memory`,
      )
      if (activeRepositoryRef.current !== repo) return
      if (response.repository_id !== repo) throw new Error(`Repository Memory returned data for ${response.repository_id}, not ${repo}.`)
      const qaHistory = Array.isArray(response.memory?.qa_history) ? response.memory.qa_history : []
      const latestQa = [...qaHistory]
        .reverse()
        .map(asQaReport)
        .find((entry) => entry?.repository_id === repo) ?? null
      const intelligenceHistory = Array.isArray(response.memory?.repository_intelligence_history)
        ? response.memory.repository_intelligence_history
        : []
      const latestIntelligence = [...intelligenceHistory]
        .reverse()
        .map((entry) => asPersistedIntelligence(entry, repo))
        .find((entry) => entry !== null) ?? null
      setQaReport(latestQa)
      setIntelligence(latestIntelligence)
      setDna(asProjectDna(response.memory?.project_dna))
    } catch (caught) {
      if (activeRepositoryRef.current !== repo) return
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
      if (activeRepositoryRef.current !== repo) return
      if (response.repository_id !== repo) throw new Error(`Repository improvements returned data for ${response.repository_id}, not ${repo}.`)
      if (response.job && response.job.repository_id !== repo) throw new Error(`Repository improvement job belongs to ${response.job.repository_id}, not ${repo}.`)
      setImprovementJob(response.job ?? null)
    } catch (caught) {
      if (activeRepositoryRef.current !== repo) return
      setImprovementJob(null)
      if (caught instanceof Error) setError(caught.message)
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
    if (!repositoryId || !improvementJob || !['accepted', 'running', 'cancelling'].includes(improvementJob.status)) return undefined
    if (improvementPollCount.current >= 300) {
      setError('Improvement status polling stopped after the bounded polling window. Refresh the workspace to check the durable job state.')
      return undefined
    }
    let cancelled = false
    const jobId = improvementJob.job_id
    const timer = window.setTimeout(() => {
      improvementPollCount.current += 1
      void apiFetch<RepositoryImprovementJob>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/improvements/jobs/${encodeURIComponent(jobId)}`,
      ).then((job) => {
        if (cancelled) return
        setImprovementJob(job)
        if (job.status === 'completed') {
          void loadPersistentIntelligence(repositoryId)
          setNotice(`Automatic improvements completed for ${repositoryId}: ${job.change_count ?? job.cumulative_changed_file_count ?? 0} file change(s) ready to download.`)
        } else if (job.status === 'failed') {
          setError(job.error || 'Automatic repository improvements failed.')
        } else if (job.status === 'cancelled') {
          setNotice(`Repository improvements stopped for ${repositoryId}. Completed pass evidence remains available.`)
        }
      }).catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Improvement status could not be refreshed.')
      })
    }, 2500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [improvementJob, repositoryId, loadPersistentIntelligence])

  function toggleCheck(name: string) {
    setQaOpenChecks((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function runIntelligence() {
    const repo = repositoryId
    setIntelligenceRunning(true)
    setError(null)
    setNotice(null)
    setPromptCopied(false)
    try {
      const report = await apiFetch<RepositoryIntelligenceReport>(
        `/v1/repositories/${encodeURIComponent(repo)}/intelligence/run`,
        { method: 'POST' },
      )
      if (activeRepositoryRef.current !== repo) return
      if (report.repository_id !== repo || report.summary.repository_id !== repo || report.repository_context.repository_id !== repo) {
        throw new Error(`Repository Intelligence returned mismatched repository data while ${repo} was selected.`)
      }
      setIntelligence({
        repository_id: repo,
        occurred_at: report.occurred_at,
        summary: report.summary,
        repository_context: report.repository_context,
        findings: report.findings,
        improvement_prompt: report.improvement_prompt,
      })
      setQaReport(report.qa.repository_id === repo ? report.qa : null)
      setCouncilReport(report.council.repository_id === repo ? report.council : null)
      setDna(report.project_dna)
      await Promise.all([loadCouncilHistory(repo), loadPersistentIntelligence(repo)])
      if (activeRepositoryRef.current === repo) {
        setNotice(`Repository Intelligence complete for ${repo}: ${report.summary.finding_count} consolidated finding(s).`)
      }
    } catch (caught) {
      if (activeRepositoryRef.current === repo) setError(caught instanceof Error ? caught.message : 'Repository Intelligence failed.')
    } finally {
      if (activeRepositoryRef.current === repo) setIntelligenceRunning(false)
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
    const repo = repositoryId
    setImprovementStarting(true)
    setError(null)
    setNotice(null)
    improvementPollCount.current = 0
    const request: RepositoryImprovementRunRequest = {
      execution_mode: executionMode,
      ...(executionMode === 'multi_pass' ? { max_work_passes: maxWorkPasses } : {}),
    }
    try {
      const job = await apiFetch<RepositoryImprovementJob>(
        `/v1/repositories/${encodeURIComponent(repo)}/improvements/run`,
        { method: 'POST', body: JSON.stringify(request) },
      )
      if (activeRepositoryRef.current !== repo) return
      if (job.repository_id !== repo) throw new Error(`Repository improvements returned a job for ${job.repository_id}, not ${repo}.`)
      setImprovementJob(job)
      setNotice(
        executionMode === 'multi_pass'
          ? `Multi-pass improvements queued for ${repo}; each work pass remains capped by the repository work-scope budget.`
          : `Single-pass improvements queued for ${repo}; HIVE is working on an isolated copy.`,
      )
    } catch (caught) {
      if (activeRepositoryRef.current === repo) {
        setError(caught instanceof Error ? caught.message : 'Automatic repository improvements could not be started.')
      }
    } finally {
      if (activeRepositoryRef.current === repo) setImprovementStarting(false)
    }
  }

  async function cancelImprovements() {
    if (!improvementJob?.cancellation_supported || !improvementJob.cancel_path) return
    if (!improvementJob.cancel_path.startsWith('/v1/')) {
      setError('The backend returned an invalid improvement cancellation path.')
      return
    }
    setImprovementCancelling(true)
    setError(null)
    try {
      const job = await apiFetch<RepositoryImprovementJob>(improvementJob.cancel_path, { method: 'POST' })
      if (job.repository_id !== repositoryId) throw new Error('Improvement cancellation returned mismatched repository data.')
      setImprovementJob(job)
      setNotice(`Stop requested for ${repositoryId}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository improvement cancellation failed.')
    } finally {
      setImprovementCancelling(false)
    }
  }

  async function repairRepositorySetup() {
    const repo = repositoryId
    setSetupRepairing(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<{ repository_id: string; ready: boolean }>(
        `/v1/repositories/${encodeURIComponent(repo)}/setup`,
        { method: 'POST' },
      )
      if (activeRepositoryRef.current !== repo) return
      if (response.repository_id !== repo) throw new Error(`Repository setup returned data for ${response.repository_id}, not ${repo}.`)
      await catalog.refresh()
      if (activeRepositoryRef.current !== repo) return
      await Promise.all([loadCouncilHistory(repo), loadPersistentIntelligence(repo), loadLatestImprovement(repo)])
      if (activeRepositoryRef.current === repo) {
        setNotice(response.ready
          ? `${repo} setup repaired and Repository Intelligence regenerated.`
          : `${repo} setup reran but still reports an incomplete required stage. Review the status below.`)
      }
    } catch (caught) {
      if (activeRepositoryRef.current === repo) {
        setError(caught instanceof Error ? caught.message : 'Repository setup repair failed.')
      }
    } finally {
      if (activeRepositoryRef.current === repo) setSetupRepairing(false)
    }
  }

  function improvementDownloadUrl(kind: 'changed_files' | 'updated_repository' | 'improvement_report' | 'pass_ledger'): string | null {
    if (!improvementJob || improvementJob.status !== 'completed' || improvementJob.repository_id !== repositoryId) return null
    if ((kind === 'improvement_report' || kind === 'pass_ledger') && !improvementJob.artifacts?.[kind]) return null
    return `/api/v1/repositories/${encodeURIComponent(repositoryId)}/improvements/jobs/${encodeURIComponent(improvementJob.job_id)}/download/${kind}`
  }

  async function refreshDna() {
    const repo = repositoryId
    setDnaRefreshing(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<RepositoryProjectDnaResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/learning/refresh-project-dna`,
        { method: 'POST' },
      )
      if (activeRepositoryRef.current !== repo) return
      setDna(response)
      setNotice(`Project DNA refreshed for ${repo}.`)
    } catch (caught) {
      if (activeRepositoryRef.current === repo) setError(caught instanceof Error ? caught.message : 'Project DNA refresh failed.')
    } finally {
      if (activeRepositoryRef.current === repo) setDnaRefreshing(false)
    }
  }

  async function submitPatchOutcome(event: FormEvent) {
    event.preventDefault()
    if (!patchSummary.trim()) return
    const repo = repositoryId
    setPatchSaving(true)
    setError(null)
    setNotice(null)
    try {
      const files = patchFiles
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
      await apiFetch<RepositoryLearningEntryResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/learning/patch-outcome`,
        {
          method: 'POST',
          body: JSON.stringify({ summary: patchSummary.trim(), success: patchSuccess, files_changed: files }),
        },
      )
      if (activeRepositoryRef.current !== repo) return
      await loadPersistentIntelligence(repo)
      if (activeRepositoryRef.current !== repo) return
      setNotice('Patch outcome recorded to Repository Memory and Project DNA refreshed.')
      setPatchSummary('')
      setPatchFiles('')
    } catch (caught) {
      if (activeRepositoryRef.current === repo) setError(caught instanceof Error ? caught.message : 'Patch outcome could not be recorded.')
    } finally {
      if (activeRepositoryRef.current === repo) setPatchSaving(false)
    }
  }

  async function submitPattern(event: FormEvent) {
    event.preventDefault()
    if (!patternText.trim()) return
    const repo = repositoryId
    setPatternSaving(true)
    setError(null)
    setNotice(null)
    try {
      await apiFetch<RepositoryLearningEntryResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/learning/coding-pattern`,
        { method: 'POST', body: JSON.stringify({ pattern: patternText.trim(), context: patternContext.trim() }) },
      )
      if (activeRepositoryRef.current !== repo) return
      await loadPersistentIntelligence(repo)
      if (activeRepositoryRef.current !== repo) return
      setNotice('Coding pattern recorded to Repository Memory and Project DNA refreshed.')
      setPatternText('')
      setPatternContext('')
    } catch (caught) {
      if (activeRepositoryRef.current === repo) setError(caught instanceof Error ? caught.message : 'Coding pattern could not be recorded.')
    } finally {
      if (activeRepositoryRef.current === repo) setPatternSaving(false)
    }
  }

  async function submitPreferredModel(event: FormEvent) {
    event.preventDefault()
    if (!preferredModelId.trim()) return
    const repo = repositoryId
    const modelId = preferredModelId.trim()
    const category = preferredCategory
    setPreferredSaving(true)
    setError(null)
    setNotice(null)
    try {
      await apiFetch<RepositoryLearningEntryResponse>(
        `/v1/repositories/${encodeURIComponent(repo)}/learning/preferred-model`,
        {
          method: 'POST',
          body: JSON.stringify({
            category,
            model_id: modelId,
            reason: preferredReason.trim(),
          }),
        },
      )
      if (activeRepositoryRef.current !== repo) return
      await loadPersistentIntelligence(repo)
      if (activeRepositoryRef.current !== repo) return
      setNotice(`Preferred model recorded for ${repo}: ${modelId} (${category}); Project DNA refreshed.`)
      setPreferredModelId('')
      setPreferredReason('')
    } catch (caught) {
      if (activeRepositoryRef.current === repo) setError(caught instanceof Error ? caught.message : 'Preferred model could not be recorded.')
    } finally {
      if (activeRepositoryRef.current === repo) setPreferredSaving(false)
    }
  }

  const qaOverallPct = qaReport ? scorePct(qaReport.score) : null
  const councilOverallPct = councilReport ? scorePct(councilReport.overall_score) : null
  const selectedRepository = catalog.repositories.find((repo) => repo.repository_id === repositoryId)
  const repositoryReady = Boolean(
    selectedRepository && !selectedRepository.rehydrated && selectedRepository.memory_ready,
  )
  const repositoryUnavailable = Boolean(repositoryId) && !catalog.loading && !selectedRepository
  const memoryFreshness = selectedRepository?.freshness?.memory ?? selectedRepository?.memory_freshness
  const reportedIntelligenceFreshness = selectedRepository?.freshness?.intelligence ?? selectedRepository?.intelligence_freshness
  const reportMatchesFingerprint = Boolean(
    intelligence?.repository_context?.fingerprint
      && selectedRepository?.fingerprint
      && intelligence.repository_context.fingerprint === selectedRepository.fingerprint,
  )
  const intelligenceCurrent = Boolean(
    reportMatchesFingerprint
      && reportedIntelligenceFreshness !== 'stale'
      && selectedRepository?.intelligence_current !== false,
  )
  const hasImprovementFindings = Boolean((intelligence?.summary.finding_count ?? 0) > 0)
  const improvementExecutionReady = Boolean(
    repositoryReady
      && memoryFreshness !== 'stale'
      && intelligenceCurrent,
  )
  const lastRefresh = selectedRepository?.last_refresh_at ?? selectedRepository?.freshness?.refreshed_at
  const sourceCommit = selectedRepository?.source_commit_sha ?? selectedRepository?.freshness?.source_commit_sha
  const scopeMetrics = selectedRepository?.improvement_scope
  const configuredWorkScopeRatio = improvementJob?.configured_change_ratio ?? scopeMetrics?.configured_ratio ?? 0.12
  const eligibleFileCount = improvementJob?.eligible_file_count ?? scopeMetrics?.eligible_file_count
  const effectiveFileLimit = improvementJob?.effective_file_limit ?? scopeMetrics?.effective_file_limit
  const activeWorkPass = improvementJob?.current_work_pass
  const maxJobWorkPasses = improvementJob?.max_work_passes
  const completedWorkPasses = improvementJob?.completed_work_passes
  const passLedger = improvementJob?.pass_ledger ?? []

  const recentHistory = useMemo(() => councilHistory.slice(-5).reverse(), [councilHistory])

  return (
    <div className="h-full overflow-x-hidden overflow-y-auto p-3 sm:p-6 lg:p-8">
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-hive-panel/75 p-4 sm:p-7">
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            One governed workspace for persistent Repository Memory, QA evidence, Council scoring, consolidated findings and code-improvement instructions.
          </p>
          <div className="mt-5 min-w-0 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3 sm:p-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <label htmlFor="repository-workspace-selector" className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/80">Current repository</label>
              {selectedRepository && (
                <span className="shrink-0 rounded-full border border-cyan-300/15 bg-cyan-300/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">
                  Active
                </span>
              )}
            </div>
            <select
              id="repository-workspace-selector"
              value={repositoryId}
              aria-label="Choose registered repository"
              onChange={(event) => selectRepository(event.target.value)}
              className="mt-2 h-12 w-full min-w-0 max-w-full rounded-xl border border-cyan-300/15 bg-hive-surface px-3 text-base font-medium text-slate-100 outline-none focus:border-cyan-300/40"
            >
              <option value="">{catalog.loading ? 'Loading repositories…' : 'Choose a registered repository…'}</option>
              {catalog.repositories.map((repo) => (
                <option key={repo.repository_id} value={repo.repository_id}>{repo.repository_id} · {repo.source_filename}</option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-slate-500">Switching repository changes Memory, QA, Council, Intelligence and improvement history together.</p>
          </div>

          {selectedRepository && (
            <div className="mt-4 min-w-0">
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 lg:grid-cols-4">
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-slate-500">Snapshot</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-200" title={selectedRepository.fingerprint}>{selectedRepository.fingerprint.slice(0, 12)}…</p>
                  {selectedRepository.source && <p className="mt-1 break-all">Source: {selectedRepository.source}</p>}
                  <p className="mt-1">Indexed version: v{selectedRepository.indexed_version}</p>
                  {sourceCommit && <p className="mt-1 break-all">Commit: {sourceCommit}</p>}
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-slate-500">Freshness</p>
                  <p className="mt-1">Last refresh: <span className="text-slate-200">{lastRefresh ? formatDate(lastRefresh) : 'Not reported'}</span></p>
                  <p className="mt-1">
                    Memory:{' '}
                    <span className="text-slate-200">
                      {memoryFreshness === 'current'
                        ? 'Current'
                        : memoryFreshness ?? (selectedRepository.memory_ready ? 'Ready · freshness unreported' : 'Not ready')}
                    </span>
                  </p>
                  <p className="mt-1">
                    Intelligence:{' '}
                    <span className="text-slate-200">
                      {intelligenceCurrent
                        ? 'Current'
                        : reportedIntelligenceFreshness
                          ?? (selectedRepository.intelligence_ready ? 'Ready · freshness unreported' : 'Not ready')}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-slate-500">Latest evidence</p>
                  <p className="mt-1">
                    QA: <span className="text-slate-200">
                      {qaOverallPct == null ? 'Not recorded' : `${qaOverallPct}% · ${qaReport?.warning_count ?? 0} warning(s)`}
                    </span>
                  </p>
                  <p className="mt-1">
                    Council: <span className="text-slate-200">
                      {councilOverallPct == null
                        ? 'Not recorded'
                        : `${councilOverallPct}% · ${councilReport?.has_unmeasured_signal ? 'unmeasured signal present' : 'recorded'}`}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-slate-500">Consolidated Intelligence</p>
                  <p className="mt-1 text-slate-200">{intelligence ? (intelligenceCurrent ? 'Matches latest fingerprint' : 'Stale for latest fingerprint') : 'Not recorded'}</p>
                  {intelligence?.occurred_at && <p className="mt-1">{formatDate(intelligence.occurred_at)}</p>}
                </div>
              </div>
            </div>
          )}


          <details className="group mt-4 rounded-2xl border border-white/8 bg-white/[0.015]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Improvement settings</p>
                <p className="mt-1 text-xs text-slate-500">
                  {executionMode === 'multi_pass'
                    ? `Multi-pass · up to ${maxWorkPasses} passes`
                    : 'Single pass'}{' '}
                  · {Math.round(configuredWorkScopeRatio * 100)}% per-pass scope
                </p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-white/8 px-4 pb-4">
              <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[1fr_1fr]">
            <fieldset className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Execution mode</legend>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/8 px-3 text-xs text-slate-300">
                  <input
                    type="radio"
                    name="repository-improvement-mode"
                    value="single_pass"
                    checked={executionMode === 'single_pass'}
                    onChange={() => setExecutionMode('single_pass')}
                  />
                  <span><strong className="text-slate-100">Single pass</strong><br />One bounded work pass.</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/8 px-3 text-xs text-slate-300">
                  <input
                    type="radio"
                    name="repository-improvement-mode"
                    value="multi_pass"
                    checked={executionMode === 'multi_pass'}
                    onChange={() => setExecutionMode('multi_pass')}
                  />
                  <span><strong className="text-slate-100">Multi-pass</strong><br />Each pass remains capped at 12%.</span>
                </label>
              </div>
              <label className="mt-3 block text-xs text-slate-400">
                Maximum work passes
                <input
                  type="number"
                  min={2}
                  max={8}
                  value={maxWorkPasses}
                  onChange={(event) => setMaxWorkPasses(Math.max(2, Math.min(8, Number(event.target.value) || 2)))}
                  disabled={executionMode !== 'multi_pass'}
                  className="mt-1 h-10 w-full rounded-xl border border-white/8 bg-hive-surface px-3 text-sm text-slate-200 disabled:opacity-50"
                />
              </label>
            </fieldset>

            <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-xs text-slate-400">
              <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">Repository work scope</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/8 p-2">
                  <p className="text-slate-500">Configured percentage</p>
                  <p className="mt-1 text-lg font-semibold text-white">{Math.round(configuredWorkScopeRatio * 100)}%</p>
                </div>
                <div className="rounded-lg border border-white/8 p-2">
                  <p className="text-slate-500">Eligible files</p>
                  <p className="mt-1 text-lg font-semibold text-white">{eligibleFileCount ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-white/8 p-2">
                  <p className="text-slate-500">Next-pass maximum</p>
                  <p className="mt-1 text-lg font-semibold text-white">{effectiveFileLimit ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-white/8 p-2">
                  <p className="text-slate-500">Files changed</p>
                  <p className="mt-1 text-lg font-semibold text-white">{improvementJob?.cumulative_changed_file_count ?? improvementJob?.change_count ?? 0}</p>
                </div>
              </div>
              <p className="mt-3 leading-5 text-slate-500">The 12% value is a per-work-pass file-change budget. It is not a Council tolerance and does not reduce the QA target.</p>
            </div>
          </div>

            </div>
          </details>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void runIntelligence()}
              disabled={intelligenceRunning || !repositoryReady}
              className={
                "flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 " +
                "bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed " +
                "disabled:opacity-50 sm:w-auto"
              }
            >
              {intelligenceRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Run Repository Intelligence
            </button>
            <button
              type="button"
              onClick={() => void startImprovements()}
              disabled={
                improvementStarting
                || !improvementExecutionReady
                || !hasImprovementFindings
                || Boolean(improvementJob && ['accepted', 'running', 'cancelling'].includes(improvementJob.status))
              }
              className={
                "flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border " +
                "border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-100 " +
                "disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              }
            >
              {improvementStarting
                || (improvementJob && ['accepted', 'running', 'cancelling'].includes(improvementJob.status))
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <Wrench className="h-4 w-4" />}
              {improvementJob && ['accepted', 'running', 'cancelling'].includes(improvementJob.status)
                ? improvementJob.status === 'cancelling' ? 'Stopping improvements…' : 'Improving repository…'
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
          <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
            <span>Repository Memory persistence is unavailable for {repositoryId}. Intelligence writes remain blocked until D1 is healthy.</span>
            <button
              type="button"
              onClick={() => void repairRepositorySetup()}
              disabled={setupRepairing}
              className="flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-rose-200/20 bg-rose-200/8 px-3 text-xs font-semibold text-rose-100 disabled:opacity-50"
            >
              {setupRepairing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Retry setup
            </button>
          </div>
        )}
        {selectedRepository && !selectedRepository.rehydrated && selectedRepository.memory_status !== 'unavailable' && !selectedRepository.memory_ready && (
          <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <span>Repository setup is incomplete for {repositoryId}. HIVE will rebuild Memory, QA, Council and the repository-specific Intelligence report from this snapshot.</span>
            <button
              type="button"
              onClick={() => void repairRepositorySetup()}
              disabled={setupRepairing}
              className="flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-200/20 bg-amber-200/8 px-3 text-xs font-semibold text-amber-100 disabled:opacity-50"
            >
              {setupRepairing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Retry setup
            </button>
          </div>
        )}

        {selectedRepository && memoryFreshness === 'stale' && selectedRepository.memory_ready && (
          <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <span>Repository Memory is stale for {repositoryId}. Refresh setup before relying on Memory-backed improvement execution.</span>
            <button
              type="button"
              onClick={() => void repairRepositorySetup()}
              disabled={setupRepairing}
              className="flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-200/20 bg-amber-200/8 px-3 text-xs font-semibold text-amber-100 disabled:opacity-50"
            >
              {setupRepairing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Refresh setup
            </button>
          </div>
        )}

        {intelligence && !intelligenceCurrent && repositoryReady && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
            This Intelligence report predates the repository-specific snapshot contract or belongs to an older snapshot. Run Repository Intelligence again before automatic improvements.
          </div>
        )}

        {selectedRepository && reportedIntelligenceFreshness === 'stale' && !intelligence && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
            Repository Intelligence is marked stale for {repositoryId}. Run Repository Intelligence again before automatic improvements.
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
              <button
                type="button"
                onClick={() => void copyImprovementPrompt()}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-200 hover:bg-white/[0.07]"
              >
                <Copy className="h-3.5 w-3.5" /> {promptCopied ? 'Copied' : 'Copy improvement prompt'}
              </button>
            )}
          </div>

          {!intelligence ? (
            <div className="mt-4">
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="No consolidated Intelligence report yet."
                body="Run Repository Intelligence to combine QA and Council evidence into one prioritised improvement report and coding prompt."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-xs text-slate-500">QA score</p>
                  <p className={`mt-1 text-xl font-semibold ${scoreTone(scorePct(intelligence.summary.qa_score))}`}>
                    {scorePct(intelligence.summary.qa_score)}%
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-xs text-slate-500">Council score</p>
                  <p className={`mt-1 text-xl font-semibold ${scoreTone(scorePct(intelligence.summary.council_score))}`}>
                    {scorePct(intelligence.summary.council_score)}%
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-xs text-slate-500">Findings</p>
                  <p className="mt-1 text-xl font-semibold text-white">{intelligence.summary.finding_count}</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-xs text-slate-500">Critical/high</p>
                  <p
                    className={
                      intelligence.summary.blocking_finding_count
                        ? 'mt-1 text-xl font-semibold text-rose-300'
                        : 'mt-1 text-xl font-semibold text-emerald-300'
                    }
                  >
                    {intelligence.summary.blocking_finding_count}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-hive-surface/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-100">{intelligence.summary.headline}</p>
                  <StatusBadge
                    status={intelligence.summary.status === 'healthy' ? 'ready' : intelligence.summary.status === 'action_required' ? 'error' : 'warning'}
                    label={intelligence.summary.status.replace(/_/g, ' ')}
                    compact
                  />
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
                        <span
                          className={
                            [
                              "rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ",
                              String(
                                finding.severity === 'critical' || finding.severity === 'high'
                                  ? 'border-rose-300/20 bg-rose-300/8 text-rose-200'
                                  : 'border-amber-300/20 bg-amber-300/8 text-amber-100',
                              ),
                            ].join('')
                          }
                        >{finding.severity}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{finding.summary}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{finding.source.replace(/_/g, ' ')} · {finding.category.replace(/_/g, ' ')} · {finding.confidence}</p>
                      {Object.keys(finding.details ?? {}).length > 0 && <pre
                        className="mt-2 max-h-56 max-w-full overflow-auto rounded-lg bg-hive-canvas p-2 font-mono text-[11px] text-slate-400"
                      >{JSON.stringify(finding.details, null, 2)}</pre>}
                    </article>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
                <p className="text-xs font-semibold text-cyan-100">{repositoryId} code-improvement prompt</p>
                <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-300">{intelligence.improvement_prompt}</pre>
              </div>
            </div>
          )}
        </section>

        {improvementJob && (
          <section className="mt-6 min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-hive-panel/70 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Wrench className="h-4 w-4 text-emerald-300" /> Automatic improvements
                </h3>
                <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                  Job {improvementJob.job_id.slice(0, 10)} · {improvementJob.stage || improvementJob.status}
                  {improvementJob.model_used ? ` · ${improvementJob.model_used}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {improvementJob.cancellation_supported && improvementJob.cancel_path
                  && ['accepted', 'running'].includes(improvementJob.status) && (
                    <button
                      type="button"
                      onClick={() => void cancelImprovements()}
                      disabled={improvementCancelling}
                      className="flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 text-xs font-semibold text-amber-100 disabled:opacity-50"
                    >
                      {improvementCancelling ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      Stop job
                    </button>
                  )}
                <StatusBadge
                  status={
                    improvementJob.status === 'completed'
                      ? 'ready'
                      : improvementJob.status === 'failed'
                        ? 'error'
                        : improvementJob.status === 'cancelled'
                          ? 'warning'
                          : 'running'
                  }
                  label={improvementJob.status.replace(/_/g, ' ')}
                  compact
                />
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <p className="text-slate-500">Work-pass progress</p>
                <p className="mt-1 font-semibold text-slate-100">
                  {activeWorkPass != null
                    ? `Pass ${activeWorkPass} of ${maxJobWorkPasses ?? '?'}`
                    : completedWorkPasses != null
                      ? `${completedWorkPasses} pass(es) completed`
                      : improvementJob.execution_mode?.replace(/_/g, ' ') ?? 'Single pass'}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <p className="text-slate-500">Model attempts</p>
                <p className="mt-1 font-semibold text-slate-100">
                  {improvementJob.model_attempt != null
                    ? `${improvementJob.model_attempt} of ${improvementJob.max_model_attempts ?? '?'}`
                    : 'Reported separately when available'}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <p className="text-slate-500">Council reviews</p>
                <p className="mt-1 font-semibold text-slate-100">
                  {improvementJob.council_review != null
                    ? `${improvementJob.council_review} of ${improvementJob.max_council_reviews ?? '?'}`
                    : 'Reported separately when available'}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <p className="text-slate-500">Findings remaining</p>
                <p className="mt-1 font-semibold text-slate-100">{improvementJob.findings_remaining ?? '—'}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-white/10 px-2.5 py-1">
                Work scope: {Math.round((improvementJob.configured_change_ratio ?? configuredWorkScopeRatio) * 100)}% per pass
              </span>
              {eligibleFileCount != null && (
                <span className="rounded-full border border-white/10 px-2.5 py-1">{eligibleFileCount} eligible files</span>
              )}
              {effectiveFileLimit != null && (
                <span className="rounded-full border border-white/10 px-2.5 py-1">{effectiveFileLimit} max files next pass</span>
              )}
              <span className="rounded-full border border-white/10 px-2.5 py-1">
                {improvementJob.cumulative_changed_file_count ?? improvementJob.change_count ?? 0} file change(s)
              </span>
              {typeof improvementJob.qa_score_after === 'number' && (
                <span className="rounded-full border border-emerald-300/15 bg-emerald-300/7 px-2.5 py-1 text-emerald-100">
                  Static QA after: {scorePct(improvementJob.qa_score_after)}%
                </span>
              )}
              {improvementJob.status === 'completed' && improvementJob.quality_target_met === false && (
                <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2.5 py-1 text-amber-100">
                  Safe progress saved · target not yet met
                </span>
              )}
            </div>

            {improvementJob.summary && <p className="mt-3 text-sm leading-6 text-slate-300">{improvementJob.summary}</p>}
            {improvementJob.error && (
              <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/8 p-3 text-xs leading-5 text-rose-200">
                {improvementJob.error}
              </p>
            )}

            {passLedger.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Per-pass ledger</p>
                <div className="mt-2 space-y-2">
                  {passLedger.map((entry) => (
                    <article key={entry.pass_number} className="rounded-xl border border-white/8 bg-white/[0.025] p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-100">Work pass {entry.pass_number}</p>
                        <StatusBadge
                          status={entry.status === 'completed' ? 'ready' : entry.status === 'failed' ? 'error' : 'readonly'}
                          label={entry.status ?? 'recorded'}
                          compact
                        />
                      </div>
                      <div className="mt-2 grid gap-1 text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
                        <p>Changed: {entry.changed_file_count ?? entry.changed_files?.length ?? 0}</p>
                        <p>Remaining findings: {entry.findings_remaining ?? '—'}</p>
                        <p>QA: {entry.qa_status ?? (entry.qa_score_after != null ? `${scorePct(entry.qa_score_after)}%` : '—')}</p>
                        <p>Security: {entry.security_status ?? '—'}</p>
                      </div>
                      {entry.model_used && <p className="mt-1 text-slate-500">Model: {entry.model_used}</p>}
                      {entry.error && <p className="mt-1 text-rose-200">{entry.error}</p>}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {improvementJob.status === 'completed' && (
              <div className="mt-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {improvementDownloadUrl('changed_files') && (
                    <a
                      href={improvementDownloadUrl('changed_files') ?? undefined}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100"
                    >
                      <Download className="h-4 w-4" /> Download changed files
                    </a>
                  )}
                  {improvementDownloadUrl('updated_repository') && (
                    <a
                      href={improvementDownloadUrl('updated_repository') ?? undefined}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-100"
                    >
                      <Download className="h-4 w-4" /> Download updated repository
                    </a>
                  )}
                  {improvementDownloadUrl('improvement_report') && (
                    <a
                      href={improvementDownloadUrl('improvement_report') ?? undefined}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-200"
                    >
                      <Download className="h-4 w-4" /> Improvement report
                    </a>
                  )}
                  {improvementDownloadUrl('pass_ledger') && (
                    <a
                      href={improvementDownloadUrl('pass_ledger') ?? undefined}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-200"
                    >
                      <Download className="h-4 w-4" /> Pass ledger
                    </a>
                  )}
                </div>
                <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
                  <p className="text-xs font-semibold text-amber-100">Remaining native-CI verification</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    HIVE static Repository QA is not equivalent to this repository's native CI. Deployment remains subject to the repository's own build, tests, lint and security gates.
                  </p>
                  {improvementJob.remaining_external_ci_verification && improvementJob.remaining_external_ci_verification.length > 0 && (
                    <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-5 text-slate-300">
                      {improvementJob.remaining_external_ci_verification.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  )}
                  {improvementJob.remaining_risks && improvementJob.remaining_risks.length > 0 && (
                    <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-5 text-slate-300">
                      {improvementJob.remaining_risks.map((risk, index) => <li key={index}>{risk}</li>)}
                    </ul>
                  )}
                </div>
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
              <EmptyState
                icon={<ShieldAlert className="h-5 w-5" />}
                title="No QA evidence recorded for this repository."
                body="Run Repository Intelligence to generate QA evidence and the consolidated report."
              />
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
              <EmptyState
                icon={<Gavel className="h-5 w-5" />}
                title="No Council evidence recorded for this repository."
                body="Run Repository Intelligence to score architecture, security, maintainability and the other Council dimensions."
              />
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

        <RepositoryMemoryPage embedded repositoryId={repositoryId} />
      </div>
    </div>
  )
}
