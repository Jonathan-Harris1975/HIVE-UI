import {
  Activity,
  Bot,
  GitBranch,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EcosystemProductionPanel, ScheduledWorkPanel } from '../components/EcosystemProductionPanel'
import { StatusBadge } from '../components/StatusBadge'
import { apiFetch } from '../lib/api'
import { formatBytes, formatDate } from '../lib/format'
import { GOVERNED_REPOSITORIES } from '../lib/repositories'
import type {
  RepoHealthItem,
  RepoHealthResponse,
  RepositoryListResponse,
  RepositoryRefreshConfiguration,
  RepositorySummary,
} from '../types/api'

type OverviewState = {
  repositories: RepositorySummary[]
  refreshConfig: RepositoryRefreshConfiguration | null
  repoHealth: RepoHealthResponse | null
}

function freshnessStatus(
  repo: RepositorySummary,
  domain: 'snapshot' | 'memory' | 'intelligence',
): string {
  if (repo.rehydrated) return 'stale'

  if (domain === 'snapshot') {
    const state = repo.freshness?.snapshot ?? repo.snapshot_status
    if (repo.snapshot_current === true || state === 'current') return 'ready'
    if (repo.snapshot_current === false || state === 'stale') return 'warning'
    return 'readonly'
  }

  if (domain === 'memory') {
    const state = repo.freshness?.memory ?? repo.memory_freshness
    const fingerprint = repo.freshness?.memory_fingerprint ?? repo.memory_fingerprint
    if (state === 'current') return 'ready'
    if (state === 'stale') return 'warning'
    if (repo.memory_status === 'unavailable') return 'error'
    if (repo.memory_ready && fingerprint && fingerprint === repo.fingerprint) return 'ready'
    return repo.memory_ready ? 'readonly' : 'warning'
  }

  const state = repo.freshness?.intelligence ?? repo.intelligence_freshness
  const fingerprint = repo.freshness?.intelligence_fingerprint ?? repo.intelligence_fingerprint
  if (state === 'current' || repo.intelligence_current === true) return 'ready'
  if (state === 'stale' || repo.intelligence_current === false) return 'warning'
  if (repo.intelligence_ready && fingerprint && fingerprint === repo.fingerprint) return 'ready'
  return repo.intelligence_ready ? 'readonly' : 'warning'
}

function freshnessLabel(
  repo: RepositorySummary,
  domain: 'snapshot' | 'memory' | 'intelligence',
): string {
  const status = freshnessStatus(repo, domain)
  if (status === 'ready') return 'Current'
  if (status === 'error') return 'Unavailable'
  if (status === 'warning') return repo.rehydrated ? 'Refresh required' : 'Attention'
  return 'Registered'
}

function repositoryReadiness(repo: RepositorySummary): string {
  if (repo.rehydrated) return 'warning'
  if (repo.memory_status === 'unavailable') return 'error'
  if (repo.pipeline_status === 'setup_incomplete' || repo.repair_required) return 'warning'
  if (
    freshnessStatus(repo, 'snapshot') === 'ready'
    && freshnessStatus(repo, 'memory') === 'ready'
    && freshnessStatus(repo, 'intelligence') === 'ready'
  ) {
    return 'ready'
  }
  return 'readonly'
}

function healthByRepository(repoHealth: RepoHealthResponse | null): Map<string, RepoHealthItem> {
  return new Map((repoHealth?.repos ?? []).map((item) => [item.repo, item]))
}

function formatUnixDate(value?: number | null): string {
  if (!value) return 'Not reported'
  return formatDate(new Date(value * 1000).toISOString())
}

export function RepositoriesPage() {
  const [state, setState] = useState<OverviewState>({
    repositories: [],
    refreshConfig: null,
    repoHealth: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOverview = useCallback(async (forceHealth = false) => {
    setLoading(true)
    setError(null)
    try {
      const [repositoriesResult, refreshResult, healthResult] = await Promise.all([
        apiFetch<RepositoryListResponse>('/v1/repositories'),
        apiFetch<RepositoryRefreshConfiguration>('/v1/repositories/refresh-config').catch(() => null),
        apiFetch<RepoHealthResponse>(
          `/v1/system/repo-health?force_refresh=${forceHealth}`,
        ).catch(() => null),
      ])
      setState({
        repositories: repositoriesResult.repositories ?? [],
        refreshConfig: refreshResult,
        repoHealth: healthResult,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository overview could not be loaded.')
      setState((current) => ({ ...current, repositories: [] }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview(false)
  }, [loadOverview])

  const summariesById = useMemo(
    () => new Map(state.repositories.map((repo) => [repo.repository_id, repo])),
    [state.repositories],
  )
  const healthMap = useMemo(() => healthByRepository(state.repoHealth), [state.repoHealth])
  const registeredCount = state.repositories.length
  const fullyCurrentCount = useMemo(
    () => state.repositories.filter((repo) => repositoryReadiness(repo) === 'ready').length,
    [state.repositories],
  )
  const serviceHealthyCount = useMemo(
    () => (state.repoHealth?.repos ?? []).filter((item) => ['healthy', 'busy', 'standby'].includes(item.status)).length,
    [state.repoHealth],
  )
  const totalFiles = useMemo(
    () => state.repositories.reduce((sum, repo) => sum + repo.file_count, 0),
    [state.repositories],
  )
  const totalBytes = useMemo(
    () => state.repositories.reduce((sum, repo) => sum + repo.total_bytes, 0),
    [state.repositories],
  )

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <section aria-busy={loading} className="rounded-3xl border border-white/8 bg-hive-panel/75 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">
                Automated repository estate
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Repository overview</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Read-only status for governed snapshots, Repository Memory, consolidated Intelligence and service health.
                Refresh, QA, Council, repair and deployment work is owned by backend automation and repository CI.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadOverview(true)}
              disabled={loading}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 hover:bg-white/[0.07] disabled:opacity-50"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh status
            </button>
          </div>

          <div className="mt-6 grid gap-2 border-t border-white/8 pt-5 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Registered</p>
              <p className="mt-1 text-xl font-semibold text-white">{loading ? 'Loading…' : error ? 'Unavailable' : `${registeredCount}/${GOVERNED_REPOSITORIES.length}`}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Fully current</p>
              <p className="mt-1 text-xl font-semibold text-white">{loading ? 'Loading…' : error ? 'Unavailable' : `${fullyCurrentCount}/${GOVERNED_REPOSITORIES.length}`}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Services healthy</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {loading ? 'Loading…' : error ? 'Unavailable' : state.repoHealth?.ok ? `${serviceHealthyCount}/${GOVERNED_REPOSITORIES.length}` : 'Unknown'}
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Indexed files</p>
              <p className="mt-1 text-xl font-semibold text-white">{loading ? 'Loading…' : error ? 'Unavailable' : totalFiles.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Snapshot size</p>
              <p className="mt-1 text-xl font-semibold text-white">{loading ? 'Loading…' : error ? 'Unavailable' : formatBytes(totalBytes)}</p>
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <EcosystemProductionPanel renderRepositoryDetails={(repositoryId) => {
          const repo = summariesById.get(repositoryId)
          const service = healthMap.get(repositoryId)
          const readiness = repo ? repositoryReadiness(repo) : 'warning'
          return (
            <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Governed snapshot</span>
                <StatusBadge status={readiness} label={repo ? (readiness === 'ready' ? 'Current' : 'Attention') : 'Missing'} compact />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Service</span>
                <StatusBadge status={service?.status ?? 'unknown'} variant="operational" compact />
              </div>
              {!repo && <p className="leading-5 text-amber-200">No governed snapshot registered for this repository.</p>}
              {repo && (
                <details>
                  <summary className="cursor-pointer text-slate-300">Snapshot, memory and intelligence</summary>
                  <p className="mt-2 break-words">{repo.source_filename ?? 'Source filename unavailable'}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(['snapshot', 'memory', 'intelligence'] as const).map((domain) => (
                      <div key={domain} className="min-w-0 rounded-lg border border-white/8 p-2">
                        <p className="break-words capitalize">{domain}</p>
                        <StatusBadge status={freshnessStatus(repo, domain)} label={freshnessLabel(repo, domain)} compact />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2">{repo.file_count.toLocaleString()} files · {formatBytes(repo.total_bytes)} · index v{repo.indexed_version}</p>
                  <p>Updated {formatUnixDate(repo.updated_at)}</p>
                  {repo.source_commit_sha && <p className="break-all font-mono">SHA {repo.source_commit_sha}</p>}
                </details>
              )}
            </div>
          )
        }} />
        <ScheduledWorkPanel scheduler={healthMap.get('MAST')} />

        <section className="mt-4 rounded-2xl border border-white/8 bg-hive-panel/60 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <Bot className="h-4 w-4 text-cyan-300" /> Automation readiness
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                The scheduled repository cycle replaces governed snapshots and runs the automated evidence pipeline.
                Manual upload and remediation controls are intentionally not exposed in HIVE-UI.
              </p>
            </div>
            <StatusBadge
              status={state.refreshConfig?.configured ? 'ready' : state.refreshConfig ? 'warning' : 'unknown'}
              label={state.refreshConfig?.configured ? 'Automation configured' : undefined}
              compact
            />
          </div>
          {state.refreshConfig && (
            <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-hive-surface p-3">
                <span className="flex items-center gap-2 text-slate-500"><GitBranch className="h-3.5 w-3.5" /> Branch</span>
                <p className="mt-1 font-medium text-slate-200">{state.refreshConfig.branch}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-hive-surface p-3">
                <span className="flex items-center gap-2 text-slate-500"><Activity className="h-3.5 w-3.5" /> Trigger</span>
                <p className="mt-1 font-medium text-slate-200">{state.refreshConfig.trigger}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-hive-surface p-3">
                <span className="flex items-center gap-2 text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Catalogue</span>
                <p className="mt-1 font-medium text-slate-200">
                  {state.refreshConfig.repository_count}/{state.refreshConfig.expected_repository_count} configured
                </p>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
