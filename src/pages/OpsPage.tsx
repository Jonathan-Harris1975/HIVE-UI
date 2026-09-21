import {
  Activity,
  BellRing,
  Database,
  HardDrive,
  LoaderCircle,
  Monitor,
  Network,
  ServerCog,
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
import { EmptyState } from '../components/EmptyState'
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
  RepoHealthItem,
  RepoHealthResponse,
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

function RepoIcon({ category }: { category?: string }) {
  if (category === 'frontend') return <Monitor className="h-3.5 w-3.5" />
  if (category === 'static_service') return <HardDrive className="h-3.5 w-3.5" />
  if (category === 'background_api' || category === 'background_worker') return <ServerCog className="h-3.5 w-3.5" />
  return <Activity className="h-3.5 w-3.5" />
}

type WakeTicket = {
  ticket_id: string
  repo: string
  status: 'running' | 'ready' | 'timeout' | 'failed'
  phase: string
  events: Array<{ phase: string; [key: string]: unknown }>
  result?: { ready: boolean; already_online: boolean; elapsed_seconds: number; attempts: number } | null
  error?: string | null
}

function wakePhaseLabel(phase: string): string {
  switch (phase) {
    case 'queued': return 'Queued'
    case 'already-online': return 'Already online'
    case 'requesting-resume': return 'Requesting Koyeb resume'
    case 'resume-request-failed': return 'Resume request failed'
    case 'starting': return 'Starting'
    case 'polling': return 'Waiting for health check'
    case 'ready': return 'Ready'
    case 'timeout': return 'Timed out'
    default: return phase.replace(/-/g, ' ')
  }
}

/** RAMS remains manually recoverable from Operations. HIVE and AIMS lifecycle
 * is session-owned and therefore has no manual wake/sleep control in the UI. */
function ServiceWakeControl({ repo, onWoken }: { repo: 'RAMS'; onWoken: () => void }) {
  const [ticket, setTicket] = useState<WakeTicket | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!ticket || ticket.status !== 'running' || !ticket.ticket_id) return
    const timer = setTimeout(async () => {
      try {
        const next = await apiFetch<WakeTicket>(`/v1/services/${repo}/ensure-ready/${ticket.ticket_id}`)
        setTicket(next)
        if (next.status === 'ready') onWoken()
      } catch {
        setTicket((current) => (current ? { ...current, status: 'failed', error: 'Lost connection while polling.' } : current))
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [ticket, repo, onWoken])

  const start = useCallback(async () => {
    setStarting(true)
    try {
      const response = await apiFetch<{ wake_id: string }>(`/v1/services/${repo}/ensure-ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setTicket({ ticket_id: response.wake_id, repo, status: 'running', phase: 'queued', events: [] })
    } catch {
      setTicket({ ticket_id: '', repo, status: 'failed', phase: 'failed', events: [], error: 'Could not start wake-up request.' })
    } finally {
      setStarting(false)
    }
  }, [repo])

  if (!ticket) {
    return (
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); void start() }}
        disabled={starting}
        className={
          "mt-2 inline-flex items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-300/8 " +
          "px-2.5 py-1 text-xs text-violet-200 transition hover:bg-violet-300/12 disabled:opacity-50"
        }
      >
        <RefreshCw className={`h-3 w-3 ${starting ? 'animate-spin' : ''}`} /> {starting ? 'Requesting…' : 'Wake up'}
      </button>
    )
  }

  const tone = ticket.status === 'ready' ? 'text-emerald-200 border-emerald-300/15 bg-emerald-300/5'
    : ticket.status === 'timeout' || ticket.status === 'failed' ? 'text-rose-200 border-rose-300/15 bg-rose-300/5'
    : 'text-violet-200 border-violet-300/15 bg-violet-300/5'

  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs ${tone}`}>
      {ticket.status === 'ready'
        ? `Ready in ${ticket.result?.elapsed_seconds ?? 0}s`
        : ticket.status === 'timeout'
          ? 'Wake-up timed out — try again shortly.'
          : ticket.status === 'failed'
            ? (ticket.error || 'Wake-up failed.')
            : `${wakePhaseLabel(ticket.phase)}…`}
    </div>
  )
}

function RepoHealthCard({ item, onInspect, onRefresh }: { item: RepoHealthItem; onInspect: () => void; onRefresh: () => void }) {
  const latency = item.liveness?.latency_ms
  const livenessStatus = item.liveness?.status || item.status
  const readinessStatus = item.readiness?.status || item.operational?.status || item.status
  const operationalStatus = item.operational?.status
  const category = item.category === 'background_worker'
    ? 'Background Worker'
    : item.category === 'background_api'
      ? 'Background API'
      : item.category === 'static_service'
        ? 'Public service'
        : item.category === 'frontend'
          ? 'Frontend'
          : 'Core API'

  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-hive-surface p-1.5 transition hover:border-cyan-300/20">
      <button
        type="button"
        onClick={onInspect}
        className="w-full rounded-lg p-1.5 text-left transition hover:bg-hive-panel-deep focus-visible:bg-hive-panel-deep"
        aria-label={`Inspect ${item.label || item.repo} health`}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-300/12 bg-cyan-300/6 text-cyan-200" aria-hidden="true">
            <RepoIcon category={item.category} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-white">{item.label || item.repo}</span>
              <span className="truncate text-xs uppercase tracking-[0.12em] text-slate-400">{category}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-400" title={item.detail || item.description}>{item.detail || item.description || 'No health detail returned.'}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <StatusBadge status={livenessStatus} variant="liveness" compact />
            <StatusBadge status={readinessStatus} variant="readiness" compact />
          </span>
        </div>
        <span className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <span>{typeof latency === 'number' ? `${latency} ms` : 'No latency'}</span>
          {item.category === 'background_worker'
            ? <span>Worker heartbeat</span>
            : operationalStatus && <span>{operationalStatus.replace(/_/g, ' ')}</span>}
        </span>
      </button>
      {item.repo === 'RAMS' && !['healthy', 'busy'].includes(item.status) && (
        <div className="px-1.5 pb-1.5">
          <ServiceWakeControl repo="RAMS" onWoken={onRefresh} />
        </div>
      )}
    </div>
  )
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
  const [repoHealth, setRepoHealth] = useState<RepoHealthResponse | null>(null)
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

  const [task, setTask] = useState('Review the HIVE repository and produce a safe, review-gated improvement plan.')
  const [repo, setRepo] = useState('HIVE')
  const [template, setTemplate] = useState('repo_debug')
  const [workflowPreset, setWorkflowPreset] = useState('')
  const [approvalState, setApprovalState] = useState('pending_review')
  const [graph, setGraph] = useState<WorkflowGraphResponse | null>(null)
  const [preview, setPreview] = useState<ExecutionPreviewResponse | null>(null)
  const [buildingGraph, setBuildingGraph] = useState(false)
  const [buildingPreview, setBuildingPreview] = useState(false)

  const loadOps = useCallback(async (forceRepoHealth = false) => {
    setLoading(true)
    setError(null)
    try {
      const [healthResult, templateResult, reviewResult, repoHealthResult, opsEventsResult, runtimeStatsResult] = await Promise.all([
        apiFetch<HealthResponse>('/health'),
        apiFetch<WorkflowTemplatesResponse>('/v1/workflow-graphs/templates'),
        apiFetch<ExecutionReviewsResponse>('/v1/execution-reviews?limit=50'),
        apiFetch<RepoHealthResponse>(`/v1/system/repo-health?force_refresh=${forceRepoHealth}`).catch(
          (caught): RepoHealthResponse => ({
            ok: false,
            overall_status: 'error',
            error: caught instanceof Error ? caught.message : 'Repo health could not be loaded.',
          }),
        ),
        apiFetch<OpsEventsResponse>('/v1/system/ops-events?limit=30').catch(
          (caught): OpsEventsResponse => ({
            ok: false,
            error: caught instanceof Error ? caught.message : 'Ops events could not be loaded.',
          }),
        ),
        apiFetch<RuntimeStatsResponse>('/v1/system/runtime-stats').catch(() => null),
      ])
      setHealth(healthResult)
      setRepoHealth(repoHealthResult)
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
      await loadOps(true)
    } catch (caught) {
      setPurgeError(caught instanceof Error ? caught.message : 'Database purge/reset failed.')
    } finally {
      setPurgingDatabases(false)
    }
  }, [loadOps, purgeConfirmation])

  useEffect(() => {
    void loadOps(false)
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
              <StatusBadge status={repoHealth?.overall_status || 'not_configured'} variant="operational" compact />
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{health?.build ?? (loading ? 'checking…' : 'unavailable')} · {health?.env ?? 'environment unavailable'}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadOps(true)}
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
            <section className="mt-4 rounded-2xl border border-white/8 bg-hive-panel/60 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">Services</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Live and production-ready state</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{repoHealth?.repos?.filter((item) => ['healthy', 'busy'].includes(item.status)).length ?? 0}/{repoHealth?.repos?.length ?? 0} healthy</span>
                  {repoHealth?.error && <button type="button" onClick={() => void loadOps(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-300/15 px-2 text-xs text-amber-100"><RefreshCw className="h-3.5 w-3.5" /> Retry</button>}
                </div>
              </div>
              {repoHealth?.repos?.length ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {repoHealth.repos.map((item) => (
                    <RepoHealthCard key={item.repo} item={item} onInspect={() => inspect(`${item.repo} health`, item, item.description)} onRefresh={() => void loadOps(true)} />
                  ))}
                </div>
              ) : (
                <div className="mt-3"><EmptyState icon={<ServerCog className="h-7 w-7" />} title="Repository health unavailable" body="Repo health could not be loaded or is not configured on this HIVE backend." action={{ label: 'Retry', onClick: () => void loadOps(true) }} /></div>
              )}
            </section>

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
                <button type="button" onClick={() => inspect('Repository health', repoHealth)} className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"><Activity className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-lg font-semibold text-white">{repoHealth?.repos?.filter((item) => ['healthy', 'busy'].includes(item.status)).length ?? 0}/{repoHealth?.repos?.length ?? 0}</p><span className="text-[10px] uppercase tracking-wider text-slate-500">Services healthy</span></button>
                <Link to="/execution-reviews" className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"><ShieldCheck className="h-4 w-4 text-violet-300" /><p className="mt-2 text-lg font-semibold text-white">{openReviewCount}</p><span className="text-[10px] uppercase tracking-wider text-slate-500">Open reviews</span></Link>
                <button type="button" onClick={() => inspect('Repository runtime', runtimeStats?.repository_manager ?? {})} className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"><Database className="h-4 w-4 text-cyan-300" /><p className="mt-2 text-lg font-semibold text-white">{runtimeStats?.repository_manager?.registered_count ?? 0}</p><span className="text-[10px] uppercase tracking-wider text-slate-500">Repositories</span></button>
                <button type="button" onClick={() => inspect('Model Registry', runtimeStats?.model_registry ?? {})} className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"><Sparkles className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-lg font-semibold text-white">{runtimeStats?.model_registry?.total_models ?? 0}</p><span className="text-[10px] uppercase tracking-wider text-slate-500">Models</span></button>
                <button type="button" onClick={() => inspect('Providers', runtimeStats?.providers ?? {})} className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"><Network className="h-4 w-4 text-violet-300" /><p className="mt-2 text-lg font-semibold text-white">{runtimeStats?.providers?.count ?? 0}</p><span className="text-[10px] uppercase tracking-wider text-slate-500">Providers</span></button>
                <button type="button" onClick={() => inspect('Default coding model', { model: runtimeStats?.model_registry?.default_coding_model })} className="rounded-xl border border-white/8 bg-hive-surface p-3 text-left"><Activity className="h-4 w-4 text-amber-300" /><p className="mt-2 truncate text-xs font-semibold text-white">{runtimeStats?.model_registry?.default_coding_model ?? '—'}</p><span className="text-[10px] uppercase tracking-wider text-slate-500">Coding default</span></button>
              </div>
            </details>

            <details className="group mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.025]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-rose-100"><Trash2 className="h-4 w-4 text-rose-300" /> Danger zone</span>
                <span className="text-[11px] text-slate-500">Database reset</span>
              </summary>
              <div className="border-t border-rose-300/10 p-4">
                <p className="text-xs leading-5 text-slate-400">Permanently clears application data from database-hive, database-comms-hub and HIVE PostgreSQL while preserving schemas and migration history.</p>
                {purgeResult?.ok && <p className="mt-2 text-xs font-medium text-emerald-200" role="status">Database reset completed successfully.</p>}
                {purgeError && !purgeDialogOpen && <p className="mt-2 text-xs text-rose-200" role="alert">{purgeError}</p>}
                <button type="button" onClick={() => { setPurgeError(null); setPurgeResult(null); setPurgeConfirmation(''); setPurgeDialogOpen(true) }} disabled={purgingDatabases} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 text-xs font-semibold text-rose-100 disabled:opacity-50">
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
