import {
  Activity,
  BellRing,
  Database,
  HardDrive,
  LoaderCircle,
  Network,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  GitBranch,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StatusBadge } from '../components/StatusBadge'
import { WorkflowGraph } from '../components/WorkflowGraph'
import { useAuth } from '../context/AuthContext'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import { GOVERNED_REPOSITORIES } from '../lib/repositories'
import type {
  ExecutionPreviewResponse,
  ExecutionReviewItem,
  ExecutionReviewsResponse,
  OpsEventItem,
  OpsEventsResponse,
  HealthResponse,
  RuntimeStatsResponse,
  WorkflowGraphResponse,
  WorkflowNode,
  WorkflowTemplate,
  WorkflowTemplatesResponse,
} from '../types/api'

type OpsTab = 'overview' | 'workflow'

const DATABASE_PURGE_CONFIRMATION = 'PURGE ALL DATABASES'

type DatabasePurgeResetResponse = {
  ok: boolean
  confirmation?: string
  d1?: {
    ok?: boolean
    database_names?: string[]
    databases?: Array<{ database_name?: string; ok?: boolean; tables_cleared?: string[] }>
  }
  sql?: {
    ok?: boolean
    dialect?: string
    tables_cleared?: string[]
    before?: Record<string, number>
    after?: Record<string, number>
  }
}

type FlagStatus = 'ready' | 'not_ready' | 'disabled' | 'partial' | 'unknown'

interface FlagProps {
  label: string
  status: FlagStatus
  detail: string
  icon: typeof Activity
}

function flagTone(status: FlagStatus): string {
  if (status === 'ready') return 'border-emerald-300/15 bg-emerald-300/7 text-emerald-200'
  if (status === 'not_ready') return 'border-rose-300/15 bg-rose-300/7 text-rose-200'
  if (status === 'partial') return 'border-amber-300/15 bg-amber-300/7 text-amber-200'
  return 'border-cyan-300/15 bg-cyan-300/7 text-cyan-200'
}

function Flag({ label, status, detail, icon: Icon }: FlagProps) {
  return (
    <article className="min-w-0 rounded-xl border border-white/8 bg-hive-panel/70 p-3">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${flagTone(status)}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-semibold text-white">{label}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-400" title={detail}>{detail}</p>
        </div>
        <StatusBadge status={status} variant="readiness" compact />
      </div>
    </article>
  )
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function configuredStatus(configured: unknown, enabled?: unknown): FlagStatus {
  if (enabled === false) return 'disabled'
  if (configured === true) return 'ready'
  if (configured === false) return enabled === undefined ? 'not_ready' : 'not_ready'
  return 'unknown'
}

function configuredText(status: FlagStatus, readyText: string, notReadyText: string, disabledText = 'Disabled by backend configuration'): string {
  if (status === 'ready') return readyText
  if (status === 'disabled') return disabledText
  if (status === 'not_ready') return notReadyText
  if (status === 'partial') return 'Partially configured; inspect backend health for the exact gap.'
  return 'Backend health contract did not include this helper flag.'
}

function OpsEventCard({ item, onInspect }: { item: OpsEventItem; onInspect: () => void }) {
  const severity = item.severity || 'warning'
  const border = severity === 'critical' ? 'border-rose-300/20' : severity === 'warning' ? 'border-amber-300/20' : 'border-cyan-300/15'
  return (
    <button type="button" onClick={onInspect} className={`w-full rounded-xl border ${border} bg-hive-surface p-3 text-left transition hover:bg-hive-panel-deep`}>
      <div className="flex items-start gap-3">
        <BellRing className={`mt-0.5 h-4 w-4 shrink-0 ${severity === 'critical' ? 'text-rose-300' : severity === 'warning' ? 'text-amber-300' : 'text-cyan-300'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-xs font-semibold text-white">{item.title || item.event_type || 'Operational event'}</h4>
            <StatusBadge status={severity} compact />
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{item.summary || 'No event summary returned.'}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-400">{item.service || 'unknown service'} · {formatDate(item.occurred_at || item.received_at)}</p>
        </div>
      </div>
    </button>
  )
}


function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringFrom(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

const OPEN_REVIEW_STATUSES = new Set(['pending_review', 'needs_changes'])

function normaliseReviewStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toLowerCase().replace(/-/g, '_') : ''
}

function isOpenReview(review: ExecutionReviewItem): boolean {
  if (review.is_open === true) return true
  if (review.is_closed === true || review.is_ready === true || review.can_execute_now) return false
  return OPEN_REVIEW_STATUSES.has(normaliseReviewStatus(review.status || 'pending_review'))
}

export function OpsPage() {
  const { refreshHealth } = useAuth()
  const { setPayload, setOpen } = useInspector()
  const [tab, setTab] = useState<OpsTab>('overview')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [opsEvents, setOpsEvents] = useState<OpsEventsResponse | null>(null)
  const [runtimeStats, setRuntimeStats] = useState<RuntimeStatsResponse | null>(null)
  const [templates, setTemplates] = useState<Record<string, WorkflowTemplate>>({})
  const [openReviewCount, setOpenReviewCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)
  const [purgeConfirmation, setPurgeConfirmation] = useState('')
  const [purgingDatabases, setPurgingDatabases] = useState(false)
  const [purgeError, setPurgeError] = useState<string | null>(null)
  const [purgeResult, setPurgeResult] = useState<DatabasePurgeResetResponse | null>(null)

  const [task, setTask] = useState('Prepare a safe, review-gated operational workflow plan.')
  const [repo, setRepo] = useState('HIVE')
  const [template, setTemplate] = useState('repo_debug')
  const [workflowPreset, setWorkflowPreset] = useState('')
  const [approvalState, setApprovalState] = useState('pending_review')
  const [graph, setGraph] = useState<WorkflowGraphResponse | null>(null)
  const [preview, setPreview] = useState<ExecutionPreviewResponse | null>(null)
  const [buildingGraph, setBuildingGraph] = useState(false)
  const [buildingPreview, setBuildingPreview] = useState(false)

  const loadOps = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [healthResult, templateResult, reviewResult, opsEventsResult, runtimeStatsResult] = await Promise.all([
        apiFetch<HealthResponse>('/health'),
        apiFetch<WorkflowTemplatesResponse>('/v1/workflow-graphs/templates'),
        apiFetch<ExecutionReviewsResponse>('/v1/execution-reviews?limit=50'),
        apiFetch<OpsEventsResponse>('/v1/system/ops-events?limit=30').catch(
          (caught): OpsEventsResponse => ({
            ok: false,
            error: caught instanceof Error ? caught.message : 'Ops events could not be loaded.',
          }),
        ),
        apiFetch<RuntimeStatsResponse>('/v1/system/runtime-stats').catch(() => null),
      ])
      setHealth(healthResult)
      setOpsEvents(opsEventsResult)
      setRuntimeStats(runtimeStatsResult)
      const activeReviews = (reviewResult.items ?? []).filter(isOpenReview)
      setTemplates(templateResult.templates ?? {})
      setOpenReviewCount(Number(reviewResult.open_count ?? activeReviews.length))
      await refreshHealth()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Operations data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [refreshHealth])

  const purgeResetDatabases = useCallback(async () => {
    if (purgeConfirmation !== DATABASE_PURGE_CONFIRMATION) return
    setPurgingDatabases(true)
    setPurgeError(null)
    setPurgeResult(null)
    try {
      const result = await apiFetch<DatabasePurgeResetResponse>('/v1/db/purge-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: purgeConfirmation }),
      })
      setPurgeResult(result)
      if (!result.ok) {
        setPurgeError('The reset completed only partially. Inspect the returned database result before retrying.')
        return
      }
      setPurgeDialogOpen(false)
      setPurgeConfirmation('')
      await loadOps()
    } catch (caught) {
      setPurgeError(caught instanceof Error ? caught.message : 'Database purge/reset failed.')
    } finally {
      setPurgingDatabases(false)
    }
  }, [loadOps, purgeConfirmation])

  useEffect(() => {
    void loadOps()
  }, [loadOps])

  const templateEntries = useMemo(() => Object.entries(templates), [templates])
  const adapterPolicy = useMemo(() => recordValue(health?.execution_adapter_policy), [health])
  const executionAdaptersEnabled = Boolean(health?.execution_adapters_enabled ?? adapterPolicy.enabled)
  const executionAdapterDetail = stringFrom(adapterPolicy.note) ?? (executionAdaptersEnabled
    ? 'Execution adapters are available for approved, allow-listed production handoffs'
    : 'Execution adapters are disabled by backend configuration')


  const storageFlags = recordFrom(health?.storage_flags)
  const r2Flags = recordFrom(storageFlags.r2)
  const sqlFlags = recordFrom(storageFlags.sql)
  const vectorizeFlags = recordFrom(storageFlags.vectorize)
  const embeddingsFlags = recordFrom(storageFlags.embeddings)
  const d1Flags = recordFrom(storageFlags.d1)

  const openrouterStatus: FlagStatus = health && hasOwn(health, 'openrouter_configured')
    ? configuredStatus(health.openrouter_configured)
    : 'unknown'
  const sqlStatus: FlagStatus = health && hasOwn(health, 'database_configured')
    ? configuredStatus(health.database_configured, sqlFlags.enabled)
    : 'unknown'
  const r2Status: FlagStatus = health && hasOwn(health, 'r2_configured')
    ? configuredStatus(health.r2_configured, r2Flags.enabled)
    : 'unknown'
  const vectorizeStatus: FlagStatus = health && hasOwn(health, 'vectorize_configured')
    ? configuredStatus(health.vectorize_configured, health.vectorize_enabled ?? vectorizeFlags.enabled)
    : 'unknown'
  const embeddingsStatus: FlagStatus = health && hasOwn(health, 'embeddings_configured')
    ? configuredStatus(health.embeddings_configured, health.embeddings_enabled ?? embeddingsFlags.enabled)
    : 'unknown'
  const d1Status: FlagStatus = health && hasOwn(health, 'd1_configured')
    ? configuredStatus(health.d1_configured, health.d1_enabled ?? d1Flags.enabled)
    : 'unknown'
  const executionStatus: FlagStatus = health ? (executionAdaptersEnabled ? 'ready' : 'disabled') : 'unknown'
  const laneCount = typeof r2Flags.ecosystem_lane_count === 'number' ? r2Flags.ecosystem_lane_count : null

  const flags: FlagProps[] = [
    {
      label: 'OpenRouter',
      status: openrouterStatus,
      detail: configuredText(openrouterStatus, 'Model gateway and routing policy', 'OpenRouter token is missing or not visible to HIVE'),
      icon: Network,
    },
    {
      label: 'SQL persistence',
      status: sqlStatus,
      detail: configuredText(sqlStatus, health?.database_dialect ? `${health.database_dialect} conversation store` : 'Conversation store configured', 'Conversation database is not configured'),
      icon: Database,
    },
    {
      label: 'R2 storage',
      status: r2Status,
      detail: configuredText(r2Status, laneCount ? `${laneCount} R2 ecosystem lanes registered` : 'Uploads and ecosystem artefacts', 'Primary R2 upload storage is not configured'),
      icon: HardDrive,
    },
    {
      label: 'Vector retrieval',
      status: vectorizeStatus,
      detail: configuredText(vectorizeStatus, 'Semantic file and chunk retrieval', 'Vectorize is enabled but missing account, token, or index', 'Vectorize is disabled'),
      icon: GitBranch,
    },
    {
      label: 'Embeddings',
      status: embeddingsStatus,
      detail: configuredText(embeddingsStatus, 'Vector generation provider', 'Embeddings are enabled but missing account, token, or model', 'Embeddings are disabled'),
      icon: Activity,
    },
    {
      label: 'D1 metadata',
      status: d1Status,
      detail: configuredText(d1Status, 'Previews and execution-review indexes', 'D1 is enabled but missing account, token, or database ID', 'D1 metadata is disabled'),
      icon: ShieldCheck,
    },
    { label: 'Execution adapters', status: executionStatus, detail: executionAdapterDetail, icon: PlayCircle },
  ]

  function inspect(title: string, value: unknown, description = 'Read-only operational data from the HIVE backend.') {
    setPayload({ eyebrow: 'Operations', title, description, json: value })
    setOpen(true)
  }

  function inspectNode(node: WorkflowNode) {
    setPayload({
      eyebrow: 'Workflow node',
      title: node.label || node.id,
      description: node.summary,
      rows: [
        { label: 'Node ID', value: node.id },
        { label: 'Type', value: String(node.type || 'unknown') },
        { label: 'Status', value: String(node.status || 'unknown') },
      ],
      json: node,
    })
    setOpen(true)
  }

  async function buildGraph(event?: FormEvent) {
    event?.preventDefault()
    if (!task.trim()) return
    setBuildingGraph(true)
    setError(null)
    try {
      const response = await apiFetch<WorkflowGraphResponse>('/v1/workflow-graphs/build', {
        method: 'POST',
        body: JSON.stringify({
          task: task.trim(),
          repo: repo || null,
          workflow_preset: workflowPreset || null,
          template: template || null,
          limit: 8,
        }),
      })
      if (!response.ok) throw new Error(response.message || response.error_code || 'Workflow graph could not be built.')
      setGraph(response)
      setPreview(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Workflow graph could not be built.')
    } finally {
      setBuildingGraph(false)
    }
  }

  async function buildPreview() {
    if (!task.trim()) return
    setBuildingPreview(true)
    setError(null)
    try {
      const response = await apiFetch<ExecutionPreviewResponse>('/v1/execution-preview', {
        method: 'POST',
        body: JSON.stringify({
          task: task.trim(),
          repo: repo || null,
          workflow_preset: workflowPreset || null,
          template: template || null,
          approval_state: approvalState,
          limit: 8,
        }),
      })
      if (!response.ok) throw new Error(response.message || response.error_code || 'Execution preview could not be created.')
      setPreview(response)
      if (response.workflow_graph) setGraph(response.workflow_graph)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Execution preview could not be created.')
    } finally {
      setBuildingPreview(false)
    }
  }

  const tabs: Array<{ id: OpsTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'workflow', label: 'Workflow lab' },
  ]

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <section className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-hive-panel/65 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">System operations</p>
              <StatusBadge status={health?.ok ? 'healthy' : loading ? 'checking' : 'down'} variant="operational" compact />
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{health?.build ?? (loading ? 'checking…' : 'unavailable')} · {health?.env ?? 'environment unavailable'}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadOps()}
            aria-label="Refresh operational status"
            title="Refresh status"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-white/8 bg-hive-surface p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={[
                'rounded-lg px-3 py-2 text-xs font-medium transition',
                tab === item.id ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-300',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}

        {loading && !health ? (
          <div className="flex items-center justify-center py-20 text-slate-400"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading operational state</div>
        ) : tab === 'overview' ? (
          <>
            {opsEvents?.items?.length ? (
              <details className="group mt-3 rounded-2xl border border-amber-300/15 bg-hive-panel/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white"><BellRing className="h-4 w-4 text-amber-300" /> Operational alerts</span>
                  <StatusBadge status={opsEvents.items.some((item) => item.severity === 'critical') ? 'critical' : 'warning'} label={`${opsEvents.count ?? 0} events`} compact />
                </summary>
                <div className="grid gap-2 border-t border-white/6 p-3 lg:grid-cols-2">
                  {opsEvents.items.slice(0, 6).map((item) => <OpsEventCard key={item.event_id} item={item} onInspect={() => inspect(item.title || 'Operational event', item, item.summary)} />)}
                </div>
              </details>
            ) : (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-white/8 bg-hive-panel/45 px-4 py-3">
                <span className="flex items-center gap-2 text-xs text-slate-400"><BellRing className="h-4 w-4 text-emerald-300" /> Operational alerts</span>
                <span className="text-xs font-medium text-emerald-200">None</span>
              </div>
            )}

            <details className="group mt-3 rounded-2xl border border-white/8 bg-hive-panel/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-semibold text-white">Integration readiness</span>
                <span className="text-xs text-slate-400">{flags.filter((flag) => flag.status === 'ready').length}/{flags.length} ready</span>
              </summary>
              <div className="grid grid-cols-1 gap-2 border-t border-white/6 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {flags.map((flag) => <Flag key={flag.label} {...flag} />)}
              </div>
            </details>

            <details className="group mt-3 rounded-2xl border border-white/8 bg-hive-panel/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-semibold text-white">Live system snapshot</span>
                <span className="text-xs text-slate-400">{openReviewCount} reviews · {runtimeStats?.providers?.count ?? 0} providers</span>
              </summary>
              <div className="grid grid-cols-2 gap-2 border-t border-white/6 p-3 sm:grid-cols-3">
                <Link
                  to="/execution-reviews"
                  className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"
                >
                  <ShieldCheck className="h-4 w-4 text-violet-300" />
                  <p className="mt-2 text-lg font-semibold text-white">{openReviewCount}</p>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Open reviews</span>
                </Link>
                <button
                  type="button"
                  onClick={() => inspect('Model Registry', runtimeStats?.model_registry ?? {})}
                  className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"
                >
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                  <p className="mt-2 text-lg font-semibold text-white">
                    {runtimeStats?.model_registry?.total_models ?? 0}
                  </p>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Models</span>
                </button>
                <button
                  type="button"
                  onClick={() => inspect('Providers', runtimeStats?.providers ?? {})}
                  className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"
                >
                  <Network className="h-4 w-4 text-violet-300" />
                  <p className="mt-2 text-lg font-semibold text-white">{runtimeStats?.providers?.count ?? 0}</p>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Providers</span>
                </button>
                <button
                  type="button"
                  onClick={() => inspect('Operational events', opsEvents ?? {})}
                  className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"
                >
                  <BellRing className="h-4 w-4 text-amber-300" />
                  <p className="mt-2 text-lg font-semibold text-white">{opsEvents?.count ?? 0}</p>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Recent events</span>
                </button>
                <button
                  type="button"
                  onClick={() => inspect('Integration readiness', {
                    ready: flags.filter((flag) => flag.status === 'ready').length,
                    total: flags.length,
                    flags,
                  })}
                  className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"
                >
                  <Activity className="h-4 w-4 text-cyan-300" />
                  <p className="mt-2 text-lg font-semibold text-white">
                    {flags.filter((flag) => flag.status === 'ready').length}/{flags.length}
                  </p>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Integrations ready</span>
                </button>
                <button
                  type="button"
                  onClick={() => inspect('Default coding model', {
                    model: runtimeStats?.model_registry?.default_coding_model,
                  })}
                  className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"
                >
                  <Activity className="h-4 w-4 text-amber-300" />
                  <p className="mt-2 truncate text-xs font-semibold text-white">
                    {runtimeStats?.model_registry?.default_coding_model ?? '—'}
                  </p>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Coding default</span>
                </button>
              </div>
            </details>

            <details className="group mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.025]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-rose-100"><Trash2 className="h-4 w-4 text-rose-300" /> Danger zone</span>
                <span className="text-[11px] text-slate-500">Database reset</span>
              </summary>
              <div className="border-t border-rose-300/10 p-4">
                <p className="text-xs leading-5 text-slate-400">
                  Permanently clears application data from database-hive, database-comms-hub and HIVE PostgreSQL while
                  preserving schemas and migration history.
                </p>
                {purgeResult?.ok && <p className="mt-2 text-xs font-medium text-emerald-200" role="status">Database reset completed successfully.</p>}
                {purgeError && !purgeDialogOpen && <p className="mt-2 text-xs text-rose-200" role="alert">{purgeError}</p>}
                <button
                  type="button"
                  onClick={() => {
                    setPurgeError(null)
                    setPurgeResult(null)
                    setPurgeConfirmation('')
                    setPurgeDialogOpen(true)
                  }}
                  disabled={purgingDatabases}
                  className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 text-xs font-semibold text-rose-100 disabled:opacity-50"
                >
                  {purgingDatabases ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Purge / reset databases
                </button>
              </div>
            </details>
          </>
        ) : (
          <section className="mt-5 grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            <form onSubmit={buildGraph} className="h-fit rounded-2xl border border-white/8 bg-hive-panel/70 p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Plan only</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Workflow builder</h3>
              <label className="mt-5 block text-xs font-medium text-slate-400">Task</label>
              <textarea
                value={task}
                aria-label="Workflow task"
                onChange={(event) => setTask(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-white/8 bg-hive-surface px-3 py-3 text-sm leading-6 text-white outline-none focus:border-cyan-300/30"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label className="text-xs font-medium text-slate-400">Repository
                  <select
                    value={repo}
                    onChange={(event) => setRepo(event.target.value)}
                    className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-hive-surface px-3 text-sm text-slate-300 outline-none"
                  >
                    {GOVERNED_REPOSITORIES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-400">Template
                  <select
                    value={template}
                    onChange={(event) => setTemplate(event.target.value)}
                    className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-hive-surface px-3 text-sm text-slate-300 outline-none"
                  >
                    {templateEntries.map(([id, item]) => <option key={id} value={id}>{item.label || id}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-400">Workflow preset
                  <input
                    value={workflowPreset}
                    onChange={(event) => setWorkflowPreset(event.target.value)}
                    placeholder="Optional preset"
                    className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-hive-surface px-3 text-sm text-slate-300 outline-none placeholder:text-slate-400"
                  />
                </label>
                <label className="text-xs font-medium text-slate-400">Approval state
                  <select
                    value={approvalState}
                    onChange={(event) => setApprovalState(event.target.value)}
                    className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-hive-surface px-3 text-sm text-slate-300 outline-none"
                  >
                    {['pending_review', 'approved', 'needs_changes', 'rejected', 'archived'].map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  type="submit"
                  disabled={!task.trim() || buildingGraph}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-hive-accent-deep disabled:opacity-50"
                >
                  {buildingGraph ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />} Build graph
                </button>
                <button
                  type="button"
                  onClick={() => void buildPreview()}
                  disabled={!task.trim() || buildingPreview}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/8 px-4 text-xs font-medium text-violet-100 disabled:opacity-50"
                >
                  {buildingPreview ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Preview statuses
                </button>
              </div>
              <p
                className="mt-4 text-xs leading-5 text-slate-400"
              >This screen builds plans and quick status previews. To save a plan as a review-gated record or manage saved previews, open <Link
                to="/execution-reviews"
                className="text-cyan-300 hover:underline"
              >Execution Reviews</Link> or <Link
                to="/execution"
                className="text-cyan-300 hover:underline"
              >Execution Plan</Link>.</p>
            </form>

            <div className="space-y-5">
              <section className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">Workflow graph</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">{graph?.template ? templates[graph.template]?.label || graph.template : 'No graph built yet'}</h3>
                    {graph?.risk_summary && <p className="mt-1 text-xs text-slate-400">Highest candidate risk: {String(graph.risk_summary.highest_risk || 'unknown')}</p>}
                  </div>
                  {graph && <StatusBadge status={graph.requires_approval ? 'review_required' : 'planned'} />}
                </div>
                <div className="mt-5"><WorkflowGraph nodes={graph?.nodes ?? []} edges={graph?.edges ?? []} onInspect={inspectNode} /></div>
              </section>

              {preview && (
                <section className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/70">Execution preview</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">Step statuses</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={preview.approval_state} />
                      <StatusBadge
                        status={preview.can_execute_now ? 'ready_for_execution' : (preview.blocked_count ?? 0) > 0 ? 'blocked' : 'pending_review'}
                        label={preview.can_execute_now ? 'Ready for handoff' : `${preview.blocked_count ?? 0} blocked`}
                      />
                      <StatusBadge status={preview.adapter_execution_enabled ? 'active' : 'disabled'} label={preview.adapter_execution_enabled ? 'Adapters enabled' : 'Adapters disabled'} />
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    {(preview.step_statuses ?? []).map((step) => (
                      <button
                        key={step.node_id}
                        type="button"
                        onClick={() => inspect(step.label || step.node_id, step, step.summary)}
                        className="grid w-full gap-3 rounded-2xl border border-white/8 bg-hive-surface p-4 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <span>
                          <span className="block text-sm font-medium text-white">{step.label || step.node_id}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-400">{step.summary || step.blocker || 'No additional detail.'}</span>
                        </span>
                        <StatusBadge status={step.status} compact />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </section>
        )}
      </div>
      <ConfirmDialog
        open={purgeDialogOpen}
        title="Purge and reset all databases?"
        summary="This permanently deletes application records from both ecosystem D1 databases and HIVE's Koyeb PostgreSQL database. The schemas and database identities remain in place."
        objectName="database-hive · database-comms-hub · Koyeb PostgreSQL"
        systems={['Cloudflare D1', 'Koyeb PostgreSQL']}
        confirmLabel={purgingDatabases ? 'Resetting…' : 'Purge / reset databases'}
        cancelLabel="Keep data"
        tone="destructive"
        busy={purgingDatabases}
        confirmDisabled={purgeConfirmation !== DATABASE_PURGE_CONFIRMATION}
        error={purgeError}
        textInput={{
          label: `Type ${DATABASE_PURGE_CONFIRMATION} to confirm`,
          value: purgeConfirmation,
          onChange: setPurgeConfirmation,
          placeholder: DATABASE_PURGE_CONFIRMATION,
          required: true,
        }}
        onConfirm={() => void purgeResetDatabases()}
        onCancel={() => {
          if (purgingDatabases) return
          setPurgeDialogOpen(false)
          setPurgeConfirmation('')
          setPurgeError(null)
        }}
      >
        <p>This action cannot be undone from HIVE-UI. R2, Vectorize, Workers KV and Durable Object storage are not touched.</p>
      </ConfirmDialog>
    </div>
  )
}
