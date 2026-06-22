import {
  Activity,
  BellRing,
  Database,
  FileWarning,
  GitBranch,
  HardDrive,
  LoaderCircle,
  Monitor,
  Network,
  ServerCog,
  PlayCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { WorkflowGraph } from '../components/WorkflowGraph'
import { useAuth } from '../context/AuthContext'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import type {
  ExecutionPreviewResponse,
  ExecutionReviewItem,
  ExecutionReviewsResponse,
  OpsEventItem,
  OpsEventsResponse,
  HealthResponse,
  RepoHealthItem,
  RepoHealthResponse,
  RepoHygieneResponse,
  WorkflowGraphResponse,
  WorkflowNode,
  WorkflowTemplate,
  WorkflowTemplatesResponse,
} from '../types/api'

type OpsTab = 'overview' | 'workflow' | 'reviews'
type ReviewDecision = 'approved' | 'rejected' | 'needs_changes' | 'archived'

interface PendingReviewDecision {
  review: ExecutionReviewItem
  decision: ReviewDecision
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
    <article className="min-w-0 rounded-xl border border-white/8 bg-[#0a192d]/70 p-3">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${flagTone(status)}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-semibold text-white">{label}</h3>
          <p className="mt-0.5 truncate text-[11px] text-slate-400" title={detail}>{detail}</p>
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

function RepoHealthCard({ item, onInspect }: { item: RepoHealthItem; onInspect: () => void }) {
  const latency = item.liveness?.latency_ms
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
    <button type="button" onClick={onInspect} className="min-w-0 rounded-xl border border-white/8 bg-[#071426] p-3 text-left transition hover:border-cyan-300/20 hover:bg-[#0b1b31]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-300/12 bg-cyan-300/6 text-cyan-200">
          <RepoIcon category={item.category} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate text-xs font-semibold text-white">{item.label || item.repo}</h4>
            <span className="truncate text-[11px] uppercase tracking-[0.12em] text-slate-400">{category}</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-400" title={item.detail || item.description}>{item.detail || item.description || 'No health detail returned.'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={item.liveness?.status || item.status} variant="liveness" compact />
          <StatusBadge status={item.readiness?.status || item.operational?.status || item.status} variant="readiness" compact />
          <StatusBadge status={item.operational?.status || item.status} variant="operational" compact />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
        <span>{typeof latency === 'number' ? `${latency} ms` : 'No latency'}</span>
        {operationalStatus && <span>Operational: {operationalStatus.replace(/_/g, ' ')}</span>}
      </div>
    </button>
  )
}

function OpsEventCard({ item, onInspect }: { item: OpsEventItem; onInspect: () => void }) {
  const severity = item.severity || 'warning'
  const border = severity === 'critical' ? 'border-rose-300/20' : severity === 'warning' ? 'border-amber-300/20' : 'border-cyan-300/15'
  return (
    <button type="button" onClick={onInspect} className={`w-full rounded-xl border ${border} bg-[#071426] p-3 text-left transition hover:bg-[#0b1b31]`}>
      <div className="flex items-start gap-3">
        <BellRing className={`mt-0.5 h-4 w-4 shrink-0 ${severity === 'critical' ? 'text-rose-300' : severity === 'warning' ? 'text-amber-300' : 'text-cyan-300'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-xs font-semibold text-white">{item.title || item.event_type || 'Operational event'}</h4>
            <StatusBadge status={severity} compact />
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-400">{item.summary || 'No event summary returned.'}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">{item.service || 'unknown service'} · {formatDate(item.occurred_at || item.received_at)}</p>
        </div>
      </div>
    </button>
  )
}

function metric(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '0'
}

function reviewId(review: ExecutionReviewItem): string {
  return String(review.plan_id || review.id || '')
}

function reviewTitle(review: ExecutionReviewItem): string {
  return String(review.task || review.title || reviewId(review) || 'Execution review')
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringFrom(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function reviewExecutionStatus(review: ExecutionReviewItem): string {
  if (review.can_execute_now) return 'ready_for_execution'
  if (review.adapter_execution_enabled && review.status === 'approved') return 'approved_handoff_pending'
  return review.status || 'pending_review'
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

function reviewString(review: ExecutionReviewItem, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = review[key]
    if (typeof value === 'string' && value.trim()) return value
    if (Array.isArray(value) && value.length) return value.join(', ')
  }
  return null
}

function reviewRisk(review: ExecutionReviewItem): string {
  return reviewString(review, 'risk_level', 'highest_risk', 'risk') || 'unknown'
}

function reviewEvidenceSummary(review: ExecutionReviewItem): string {
  const evidence = recordValue(review.evidence)
  return reviewString(review, 'evidence_summary', 'review_evidence_summary', 'summary')
    || stringFrom(evidence.summary)
    || 'No review evidence summary returned.'
}

function reviewDecisionLabel(decision: ReviewDecision): string {
  if (decision === 'approved') return 'Approve review'
  if (decision === 'needs_changes') return 'Mark needs changes'
  if (decision === 'rejected') return 'Reject review'
  return 'Archive review'
}

export function OpsPage() {
  const { refreshHealth } = useAuth()
  const { setPayload, setOpen } = useInspector()
  const [tab, setTab] = useState<OpsTab>('overview')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [hygiene, setHygiene] = useState<RepoHygieneResponse | null>(null)
  const [repoHealth, setRepoHealth] = useState<RepoHealthResponse | null>(null)
  const [opsEvents, setOpsEvents] = useState<OpsEventsResponse | null>(null)
  const [templates, setTemplates] = useState<Record<string, WorkflowTemplate>>({})
  const [reviews, setReviews] = useState<ExecutionReviewItem[]>([])
  const [openReviewCount, setOpenReviewCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [task, setTask] = useState('Review the HIVE repository and produce a safe, review-gated improvement plan.')
  const [repo, setRepo] = useState('HIVE')
  const [template, setTemplate] = useState('repo_debug')
  const [workflowPreset, setWorkflowPreset] = useState('')
  const [approvalState, setApprovalState] = useState('pending_review')
  const [graph, setGraph] = useState<WorkflowGraphResponse | null>(null)
  const [preview, setPreview] = useState<ExecutionPreviewResponse | null>(null)
  const [buildingGraph, setBuildingGraph] = useState(false)
  const [buildingPreview, setBuildingPreview] = useState(false)
  const [savingReview, setSavingReview] = useState(false)
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null)
  const [pendingReviewDecision, setPendingReviewDecision] = useState<PendingReviewDecision | null>(null)
  const [decisionNote, setDecisionNote] = useState('')

  const loadOps = useCallback(async (forceRepoHealth = false) => {
    setLoading(true)
    setError(null)
    try {
      const [healthResult, hygieneResult, templateResult, reviewResult, repoHealthResult, opsEventsResult] = await Promise.all([
        apiFetch<HealthResponse>('/health'),
        apiFetch<RepoHygieneResponse>('/v1/system/repo-hygiene?include_hashes=false&max_files=5000'),
        apiFetch<WorkflowTemplatesResponse>('/v1/workflow-graphs/templates'),
        apiFetch<ExecutionReviewsResponse>('/v1/execution-reviews?limit=50'),
        apiFetch<RepoHealthResponse>(`/v1/system/repo-health?force_refresh=${forceRepoHealth}`).catch(() => null),
        apiFetch<OpsEventsResponse>('/v1/system/ops-events?limit=30').catch(() => null),
      ])
      setHealth(healthResult)
      setHygiene(hygieneResult)
      setRepoHealth(repoHealthResult)
      setOpsEvents(opsEventsResult)
      const activeReviews = (reviewResult.items ?? []).filter(isOpenReview)
      setTemplates(templateResult.templates ?? {})
      setReviews(activeReviews)
      setOpenReviewCount(Number(reviewResult.open_count ?? activeReviews.length))
      await refreshHealth()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Operations data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [refreshHealth])

  useEffect(() => {
    void loadOps(false)
  }, [loadOps])

  const templateEntries = useMemo(() => Object.entries(templates), [templates])
  const adapterPolicy = useMemo(() => recordValue(health?.execution_adapter_policy), [health])
  const executionAdaptersEnabled = Boolean(health?.execution_adapters_enabled ?? adapterPolicy.enabled)
  const executionAdaptersRequireApproval = Boolean(adapterPolicy.requires_approval ?? true)
  const executionAdapterDetail = stringFrom(adapterPolicy.note) ?? (executionAdaptersEnabled
    ? 'Execution adapters are available for approved, allow-listed production handoffs'
    : 'Execution adapters are disabled by backend configuration')
  const executionAdapterSummary = health
    ? executionAdaptersEnabled
      ? executionAdaptersRequireApproval
        ? 'execution adapters ready after approval'
        : 'execution adapters ready'
      : 'execution adapters disabled by config'
    : 'execution adapter status loading'

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
      detail: configuredText(d1Status, 'Skills, previews and execution-review indexes', 'D1 is enabled but missing account, token, or database ID', 'D1 metadata is disabled'),
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

  async function createReview() {
    if (!task.trim()) return
    setSavingReview(true)
    setError(null)
    try {
      const response = await apiFetch<{ ok: boolean; message?: string; error_code?: string }>('/v1/execution-reviews', {
        method: 'POST',
        body: JSON.stringify({
          task: task.trim(),
          repo: repo || null,
          workflow_preset: workflowPreset || null,
          requested_by: 'HIVE-UI',
          limit: 8,
          dry_run: false,
        }),
      })
      if (!response.ok) throw new Error(response.message || response.error_code || 'Review plan could not be saved.')
      await loadOps()
      setTab('reviews')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review plan could not be saved.')
    } finally {
      setSavingReview(false)
    }
  }

  function requestReviewDecision(review: ExecutionReviewItem, decision: ReviewDecision) {
    setPendingReviewDecision({ review, decision })
    setDecisionNote('')
  }

  async function decideReview(review: ExecutionReviewItem, decision: ReviewDecision, note: string) {
    const id = reviewId(review)
    if (!id) return
    setDecisionBusy(`${id}:${decision}`)
    setError(null)
    setReviews((current) => current.filter((item) => reviewId(item) !== id))
    setOpenReviewCount((current) => Math.max(0, current - 1))
    try {
      const response = await apiFetch<{ ok: boolean; error_code?: string }>(`/v1/execution-reviews/${encodeURIComponent(id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, reviewer: 'HIVE-UI', note: note.trim() || null }),
      })
      if (!response.ok) throw new Error(response.error_code || 'Review decision could not be recorded.')
      await loadOps(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review decision could not be recorded.')
      await loadOps()
    } finally {
      setDecisionBusy(null)
      setPendingReviewDecision(null)
    }
  }

  async function openEvidence(review: ExecutionReviewItem) {
    const id = reviewId(review)
    if (!id) return
    setDecisionBusy(`${id}:evidence`)
    try {
      const evidence = await apiFetch(`/v1/execution-reviews/${encodeURIComponent(id)}/evidence-pack`)
      inspect('Execution review evidence pack', evidence, `Evidence and decision history for ${id}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Evidence pack could not be loaded.')
    } finally {
      setDecisionBusy(null)
    }
  }

  const tabs: Array<{ id: OpsTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'workflow', label: 'Workflow lab' },
    { id: 'reviews', label: `Reviews${openReviewCount ? ` · ${openReviewCount}` : ''}` },
  ]

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <section className="flex flex-col gap-5 rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Control plane</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Operational health and controlled workflow planning</h2>
            <p className="mt-2 text-sm text-slate-400">Build {health?.build ?? 'unknown'} · {health?.env ?? 'environment unknown'} · {executionAdapterSummary}</p>
          </div>
          <button type="button" onClick={() => void loadOps(true)} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs text-slate-300 hover:bg-white/[0.07]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh status
          </button>
        </section>

        <div className="mt-4 flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-[#071426] p-1.5">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-medium transition ${tab === item.id ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-300'}`}>
              {item.label}
            </button>
          ))}
        </div>

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}

        {loading && !health ? (
          <div className="flex items-center justify-center py-20 text-slate-400"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading operational state</div>
        ) : tab === 'overview' ? (
          <>
            <section className="mt-5 rounded-2xl border border-white/8 bg-[#0a192d]/60 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Repository and service health</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">Online is process liveness; Ready is configuration readiness; Degraded means the repo responds with partial capability.</p>
                </div>
                <div className="flex items-center gap-1.5"><StatusBadge status={repoHealth?.overall_status || 'not_configured'} variant="operational" compact />{repoHealth?.error && <button type="button" onClick={() => void loadOps(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300/15 bg-amber-300/7 px-2.5 text-[11px] text-amber-100"><RefreshCw className="h-3.5 w-3.5" /> Retry</button>}</div>
              </div>
              {repoHealth?.repos?.length ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {repoHealth.repos.map((item) => (
                    <RepoHealthCard key={item.repo} item={item} onInspect={() => inspect(`${item.repo} health`, item, item.description)} />
                  ))}
                </div>
              ) : (
                <div className="mt-3"><EmptyState icon={<ServerCog className="h-8 w-8" />} title="Repository health unavailable" body="Repo health could not be loaded or is not configured on this HIVE backend." action={{ label: 'Retry', onClick: () => void loadOps(true) }} /></div>
              )}
            </section>

            <section className="mt-5 rounded-3xl border border-white/8 bg-[#0a192d]/70 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">Operational alerts</h3>
                  <p className="mt-1 text-xs text-slate-400">Central, redacted events from runtime services and deployment watchers.</p>
                </div>
                <StatusBadge status={(opsEvents?.items?.some((item) => item.severity === 'critical') ? 'critical' : opsEvents?.items?.length ? 'warning' : 'healthy')} label={`${opsEvents?.count ?? 0} events`} compact />
              </div>
              {opsEvents?.items?.length ? (
                <div className="mt-4 grid gap-2 lg:grid-cols-2">
                  {opsEvents.items.slice(0, 6).map((item) => (
                    <OpsEventCard key={item.event_id} item={item} onInspect={() => inspect(item.title || 'Operational event', item, item.summary)} />
                  ))}
                </div>
              ) : (
                <div className="mt-4"><EmptyState icon={<BellRing className="h-8 w-8" />} title="No operational events" body="No operational events are currently recorded." /></div>
              )}
            </section>

            <section className="mt-3 grid grid-cols-2 gap-2">
              {flags.map((flag) => <Flag key={flag.label} {...flag} />)}
            </section>

            <section className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => inspect('Repository hygiene', hygiene)} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-5 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                <GitBranch className="h-5 w-5 text-cyan-300" />
                <p className="mt-4 text-2xl font-semibold text-white">{metric(hygiene?.scanned_file_count)}</p>
                <h3 className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Files scanned</h3>
              </button>
              <button type="button" onClick={() => inspect('Duplicate content groups', hygiene?.duplicate_content ?? [])} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-5 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                <FileWarning className="h-5 w-5 text-amber-300" />
                <p className="mt-4 text-2xl font-semibold text-white">{metric(hygiene?.duplicate_content_group_count)}</p>
                <h3 className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Duplicate groups</h3>
              </button>
              <button type="button" onClick={() => inspect('Orphan candidates', hygiene?.orphan_candidates ?? [])} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-5 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                <XCircle className="h-5 w-5 text-rose-300" />
                <p className="mt-4 text-2xl font-semibold text-white">{metric(hygiene?.orphan_candidate_count)}</p>
                <h3 className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Orphan candidates</h3>
              </button>
              <button type="button" onClick={() => setTab('reviews')} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-5 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                <ShieldCheck className="h-5 w-5 text-violet-300" />
                <p className="mt-4 text-2xl font-semibold text-white">{openReviewCount}</p>
                <h3 className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Open reviews</h3>
              </button>
            </section>

            <section className="mt-5 rounded-3xl border border-white/8 bg-[#0a192d]/70 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Workflow templates</h3>
                  <p className="mt-1 text-xs text-slate-300">Planning presets exposed by the backend. They build graphs but do not execute tools.</p>
                </div>
                <button type="button" onClick={() => setTab('workflow')} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-3 text-xs text-cyan-100">
                  <Sparkles className="h-4 w-4" /> Open workflow lab
                </button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {templateEntries.map(([id, item]) => (
                  <button key={id} type="button" onClick={() => { setTemplate(id); setRepo(item.default_repo || 'HIVE'); setTab('workflow') }} className="rounded-2xl border border-white/8 bg-[#071426] p-4 text-left transition hover:border-cyan-300/20">
                    <div className="flex items-center justify-between gap-2">
                      <Network className="h-4 w-4 text-emerald-300" />
                      {item.free_tier_safe && <StatusBadge status="ready" label="Free-tier safe" compact />}
                    </div>
                    <h4 className="mt-4 text-sm font-semibold text-white">{item.label || id}</h4>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{item.description || 'Workflow planning template.'}</p>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : tab === 'workflow' ? (
          <section className="mt-5 grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            <form onSubmit={buildGraph} className="h-fit rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Plan only</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Workflow builder</h3>
              <label className="mt-5 block text-xs font-medium text-slate-400">Task</label>
              <textarea value={task} onChange={(event) => setTask(event.target.value)} rows={5} className="mt-2 w-full resize-none rounded-xl border border-white/8 bg-[#071426] px-3 py-3 text-sm leading-6 text-white outline-none focus:border-cyan-300/30" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label className="text-xs font-medium text-slate-400">Repository
                  <select value={repo} onChange={(event) => setRepo(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-300 outline-none">
                    {['HIVE', 'AIMS', 'RAMS', 'Website'].map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-400">Template
                  <select value={template} onChange={(event) => setTemplate(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-300 outline-none">
                    {templateEntries.map(([id, item]) => <option key={id} value={id}>{item.label || id}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-400">Workflow preset
                  <input value={workflowPreset} onChange={(event) => setWorkflowPreset(event.target.value)} placeholder="Optional preset" className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-300 outline-none placeholder:text-slate-400" />
                </label>
                <label className="text-xs font-medium text-slate-400">Approval state
                  <select value={approvalState} onChange={(event) => setApprovalState(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-[#071426] px-3 text-sm text-slate-300 outline-none">
                    {['pending_review', 'approved', 'needs_changes', 'rejected', 'archived'].map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                <button type="submit" disabled={!task.trim() || buildingGraph} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-50">
                  {buildingGraph ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />} Build graph
                </button>
                <button type="button" onClick={() => void buildPreview()} disabled={!task.trim() || buildingPreview} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/8 px-4 text-xs font-medium text-violet-100 disabled:opacity-50">
                  {buildingPreview ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Preview statuses
                </button>
                <button type="button" onClick={() => void createReview()} disabled={!task.trim() || savingReview} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 disabled:opacity-50">
                  {savingReview ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save to review queue
                </button>
              </div>
              <p className="mt-4 text-[11px] leading-5 text-slate-400">This screen builds plans, previews and review records. Approved plans can move to an allow-listed production handoff; operator-triggered execution stays separate from the approval click.</p>
            </form>

            <div className="space-y-5">
              <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-6">
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
                <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/70">Execution preview</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">Step statuses</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={preview.approval_state} />
                      <StatusBadge status={preview.can_execute_now ? 'ready_for_execution' : (preview.blocked_count ?? 0) > 0 ? 'blocked' : 'pending_review'} label={preview.can_execute_now ? 'Ready for handoff' : `${preview.blocked_count ?? 0} blocked`} />
                      <StatusBadge status={preview.adapter_execution_enabled ? 'active' : 'disabled'} label={preview.adapter_execution_enabled ? 'Adapters enabled' : 'Adapters disabled'} />
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    {(preview.step_statuses ?? []).map((step) => (
                      <button key={step.node_id} type="button" onClick={() => inspect(step.label || step.node_id, step, step.summary)} className="grid w-full gap-3 rounded-2xl border border-white/8 bg-[#071426] p-4 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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
        ) : (
          <section className="mt-5 rounded-3xl border border-white/8 bg-[#0a192d]/75 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/70">Human gate</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Execution review queue</h3>
                <p className="mt-1 text-xs text-slate-300">Approval marks an allow-listed production handoff as ready when backend execution adapters are enabled, then removes the item from this active queue. It does not auto-run repository mutations or background jobs.</p>
              </div>
              <button type="button" onClick={() => void loadOps()} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-slate-300"><RefreshCw className="h-4 w-4" /> Refresh queue</button>
            </div>

            {reviews.length === 0 ? (
              <div className="mt-5"><EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="No executions pending review." body="Review queue is clear." /></div>
            ) : (
              <>
              <div className="mt-5 space-y-3 md:hidden">
                {reviews.map((review) => {
                  const id = reviewId(review)
                  const busy = decisionBusy?.startsWith(`${id}:`) ?? false
                  return (
                    <article key={id} className="rounded-2xl border border-white/8 bg-[#0a192d]/65 p-4">
                      <button type="button" onClick={() => inspect('Execution review', review, id)} className="w-full text-left">
                        <span className="block text-sm font-semibold leading-6 text-white">{reviewTitle(review)}</span>
                        <span className="mt-1 block break-all text-[11px] text-slate-500">{id}</span>
                        <span className="mt-2 block text-[11px] text-slate-400">{reviewString(review, 'action_type', 'action') || 'review_gated_plan'} · {reviewString(review, 'skill_name', 'skill') || 'no skill linked'}</span>
                        <span className="mt-2 line-clamp-3 block text-[11px] leading-5 text-slate-400">{reviewEvidenceSummary(review)}</span>
                      </button>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                        <span><span className="block uppercase tracking-[0.12em] text-slate-500">Target</span><span className="text-slate-200">{reviewString(review, 'target', 'repo') || review.repo || 'Shared'}</span></span>
                        <span><span className="block uppercase tracking-[0.12em] text-slate-500">Created</span>{formatDate(review.created_at || review.updated_at)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge status={reviewRisk(review)} compact />
                        <StatusBadge status={review.status} compact />
                        <StatusBadge status={reviewExecutionStatus(review)} compact />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        <button type="button" disabled={busy} onClick={() => void openEvidence(review)} className="rounded-lg border border-white/8 bg-white/[0.035] px-2.5 py-1.5 text-[11px] text-slate-300 disabled:opacity-40">Evidence</button>
                        <button type="button" disabled={busy} onClick={() => requestReviewDecision(review, 'approved')} className="rounded-lg border border-emerald-300/15 bg-emerald-300/7 px-2.5 py-1.5 text-[11px] text-emerald-200 disabled:opacity-40">Approve</button>
                        <button type="button" disabled={busy} onClick={() => requestReviewDecision(review, 'needs_changes')} className="rounded-lg border border-amber-300/15 bg-amber-300/7 px-2.5 py-1.5 text-[11px] text-amber-200 disabled:opacity-40">Needs changes</button>
                        <button type="button" disabled={busy} onClick={() => requestReviewDecision(review, 'rejected')} className="rounded-lg border border-rose-300/15 bg-rose-300/7 px-2.5 py-1.5 text-[11px] text-rose-200 disabled:opacity-40">Reject</button>
                      </div>
                      {busy && <span className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400"><LoaderCircle className="h-3 w-3 animate-spin" /> Updating review</span>}
                    </article>
                  )
                })}
              </div>

              <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-white/8 md:block">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead className="bg-[#071426] text-[11px] uppercase tracking-[0.14em] text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Task</th>
                      <th className="px-4 py-3 font-medium">Target</th>
                      <th className="px-4 py-3 font-medium">Risk</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Execution</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {reviews.map((review) => {
                      const id = reviewId(review)
                      const busy = decisionBusy?.startsWith(`${id}:`) ?? false
                      return (
                        <tr key={id} className="bg-[#0a192d]/50 align-top hover:bg-white/[0.025]">
                          <td className="max-w-[420px] px-4 py-4">
                            <button type="button" onClick={() => inspect('Execution review', review, id)} className="text-left">
                              <span className="block text-sm font-medium text-white">{reviewTitle(review)}</span>
                              <span className="mt-1 block text-[11px] text-slate-400">{reviewString(review, 'action_type', 'action') || 'review_gated_plan'} · {reviewString(review, 'skill_name', 'skill') || 'no skill linked'}</span>
                              <span className="mt-1 line-clamp-2 block text-[11px] leading-5 text-slate-400">{reviewEvidenceSummary(review)}</span>
                            </button>
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-400"><span className="block text-slate-200">{reviewString(review, 'target', 'repo') || review.repo || 'Shared'}</span><span className="mt-1 block text-[11px] text-slate-500">{id}</span></td>
                          <td className="px-4 py-4"><StatusBadge status={reviewRisk(review)} compact /></td>
                          <td className="px-4 py-4"><StatusBadge status={review.status} compact /></td>
                          <td className="px-4 py-4"><StatusBadge status={reviewExecutionStatus(review)} compact /></td>
                          <td className="px-4 py-4 text-xs text-slate-400">{formatDate(review.created_at || review.updated_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <button type="button" disabled={busy} onClick={() => void openEvidence(review)} className="rounded-lg border border-white/8 bg-white/[0.035] px-2.5 py-1.5 text-[11px] text-slate-300 disabled:opacity-40">Evidence</button>
                              <button type="button" disabled={busy} onClick={() => requestReviewDecision(review, 'approved')} className="rounded-lg border border-emerald-300/15 bg-emerald-300/7 px-2.5 py-1.5 text-[11px] text-emerald-200 disabled:opacity-40">Approve</button>
                              <button type="button" disabled={busy} onClick={() => requestReviewDecision(review, 'needs_changes')} className="rounded-lg border border-amber-300/15 bg-amber-300/7 px-2.5 py-1.5 text-[11px] text-amber-200 disabled:opacity-40">Needs changes</button>
                              <button type="button" disabled={busy} onClick={() => requestReviewDecision(review, 'rejected')} className="rounded-lg border border-rose-300/15 bg-rose-300/7 px-2.5 py-1.5 text-[11px] text-rose-200 disabled:opacity-40">Reject</button>
                            </div>
                            {busy && <span className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400"><LoaderCircle className="h-3 w-3 animate-spin" /> Updating review</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingReviewDecision)}
        title={pendingReviewDecision ? reviewDecisionLabel(pendingReviewDecision.decision) : 'Review decision'}
        summary={pendingReviewDecision?.decision === 'approved' ? 'This will record approval, mark the handoff ready where adapters allow it, and remove the item from the active queue.' : 'This will record the review decision and remove the item from the active queue.'}
        objectName={pendingReviewDecision ? reviewTitle(pendingReviewDecision.review) : undefined}
        systems={['D1 execution review rows', 'PostgreSQL review records where mirrored', 'Backend execution-review audit trail']}
        confirmLabel={pendingReviewDecision ? reviewDecisionLabel(pendingReviewDecision.decision) : 'Confirm'}
        tone={pendingReviewDecision?.decision === 'rejected' ? 'destructive' : 'default'}
        busy={Boolean(decisionBusy)}
        textInput={{
          label: 'Decision note',
          value: decisionNote,
          onChange: setDecisionNote,
          placeholder: pendingReviewDecision?.decision === 'rejected' ? 'State why this review is rejected' : 'Add context for the audit trail',
          multiline: true,
          required: pendingReviewDecision?.decision === 'rejected',
        }}
        confirmDisabled={pendingReviewDecision?.decision === 'rejected' && !decisionNote.trim()}
        onConfirm={() => {
          if (!pendingReviewDecision) return
          void decideReview(pendingReviewDecision.review, pendingReviewDecision.decision, decisionNote)
        }}
        onCancel={() => setPendingReviewDecision(null)}
      />
    </div>
  )
}
