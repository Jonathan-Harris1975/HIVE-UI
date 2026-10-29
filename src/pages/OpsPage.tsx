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
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Link } from 'react-router'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  acknowledgeHIVENotification,
  AudioNotificationSettings,
  notifyNewHIVEEvents,
} from '../components/AudioNotificationSettings'
import { StatusBadge } from '../components/StatusBadge'
import { WorkflowGraph } from '../components/WorkflowGraph'
import { useAuth } from '../context/AuthContext'
import { useInspector } from '../context/InspectorContext'
import { ApiError, apiFetch, apiFetchWithMetadata } from '../lib/api'
import { formatDate } from '../lib/format'
import { weeklyReportHtmlHref } from '../lib/weekly-lifecycle-report'
import { acquireActionLock, hasCurrentLifecycleApproval, isSnapshotFresh, lifecycleIdempotencyKey, releaseActionLock, safeRepairHandoffFailure } from '../lib/ops-action-policy'
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
  WeeklyLifecycleReportCurrentResponse,
} from '../types/api'

type OpsTab = 'overview' | 'workflow'

type DatabaseResetTarget = {
  id: string
  label: string
  kind: 'sql' | 'd1'
  enabled: boolean
  required_confirmation: string
}

type DatabaseResetPreview = {
  ok: boolean
  target?: string
  database_name?: string
  dialect?: string
  tables?: Array<{ name: string; rows: number }>
  total_rows?: number
  preserved_tables?: string[]
  preserves?: string[]
  message?: string
  unavailable?: unknown
}

type DatabasePurgeResetResponse = {
  ok: boolean
  target?: string
  confirmation?: string
  result?: Record<string, unknown>
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

function OpsEventCard({ item, onInspect, onDelete }: { item: OpsEventItem; onInspect: () => void; onDelete: () => void }) {
  const severity = item.severity || 'warning'
  const border = severity === 'critical' ? 'border-rose-300/20' : severity === 'warning' ? 'border-amber-300/20' : 'border-cyan-300/15'
  return (
    <article className={`rounded-xl border ${border} bg-hive-surface p-3`}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onInspect} className="min-w-0 flex-1 text-left transition hover:bg-hive-panel-deep">
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
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete alert: ${item.title || item.event_type || 'Operational event'}`}
          title="Delete alert"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-300/15 text-rose-200 hover:bg-rose-300/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
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
  const [lifecycleReport, setLifecycleReport] = useState<WeeklyLifecycleReportCurrentResponse | null>(null)
  const [weeklyReportOpenError, setWeeklyReportOpenError] = useState<string | null>(null)
  const [reportHistory, setReportHistory] = useState<Array<Record<string, unknown>>>([])
  const [lifecycleReviews, setLifecycleReviews] = useState<Array<Record<string, unknown>>>([])
  const [reviewActionMessage, setReviewActionMessage] = useState('')
  const reviewActionLocks = useRef(new Set<string>())
  const snapshotRefresh = useRef(false)
  const [actionableDataError, setActionableDataError] = useState<string | null>(null)
  const [actionableUpdatedAt, setActionableUpdatedAt] = useState<number | null>(null)
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<number | null>(null)
  const [freshnessNow, setFreshnessNow] = useState<number | null>(null)
  const [opsEventDeleteTarget, setOpsEventDeleteTarget] = useState<{ eventId?: string; title?: string; clearAll?: boolean } | null>(null)
  const [opsEventDeleteBusy, setOpsEventDeleteBusy] = useState(false)
  const [opsEventDeleteError, setOpsEventDeleteError] = useState<string | null>(null)
  const [opsEventActionMessage, setOpsEventActionMessage] = useState('')
  const observedEventIds = useRef<Set<string> | null>(null)
  const observedReviewIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    const items = opsEvents?.items || []
    if (!observedEventIds.current) {
      observedEventIds.current = new Set(items.map((item) => item.event_id))
      return
    }
    const fresh = items.filter((item) => !observedEventIds.current?.has(item.event_id))
    items.forEach((item) => observedEventIds.current?.add(item.event_id))
    if (fresh.length) notifyNewHIVEEvents(fresh)
  }, [opsEvents])
  useEffect(() => {
    const items = lifecycleReviews
    if (!observedReviewIds.current) {
      observedReviewIds.current = new Set(items.map((item) => String(item.review_id)))
      return
    }
    const fresh = items.filter((item) => !observedReviewIds.current?.has(String(item.review_id)))
    items.forEach((item) => observedReviewIds.current?.add(String(item.review_id)))
    if (fresh.length) {
      notifyNewHIVEEvents(fresh.map((item) => ({
        event_id: String(item.review_id),
        event_type: 'review_required',
        severity: String(item.severity || 'warning'),
        details: { requires_action: true },
        title: String(item.title || 'Review required'),
        summary: String(item.summary || 'A decision is required.'),
      })))
    }
  }, [lifecycleReviews])
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
  const [resetTargets, setResetTargets] = useState<DatabaseResetTarget[]>([])
  const [selectedResetTarget, setSelectedResetTarget] = useState('')
  const [purgePreview, setPurgePreview] = useState<DatabaseResetPreview | null>(null)

  const [task, setTask] = useState('Prepare a safe, review-gated operational workflow plan.')
  const [repo, setRepo] = useState('HIVE')
  const [template, setTemplate] = useState('repo_debug')
  const [workflowPreset, setWorkflowPreset] = useState('')
  const [approvalState, setApprovalState] = useState('pending_review')
  const [graph, setGraph] = useState<WorkflowGraphResponse | null>(null)
  const [preview, setPreview] = useState<ExecutionPreviewResponse | null>(null)
  const [buildingGraph, setBuildingGraph] = useState(false)
  const [buildingPreview, setBuildingPreview] = useState(false)

  const loadOps = useCallback(async (background = false) => {
    if (snapshotRefresh.current) return
    snapshotRefresh.current = true
    if (!background) setLoading(true)
    setError(null)
    const signal = AbortSignal.timeout(20_000)
    try {
      const [
        healthResult,
        templateResult,
        reviewResult,
        opsEventsResult,
        runtimeStatsResult,
        lifecycleResult,
        lifecycleReviewsResult,
        reportHistoryResult,
      ] = await Promise.all([
        apiFetch<HealthResponse>('/health', { signal }),
        apiFetch<WorkflowTemplatesResponse>('/v1/workflow-graphs/templates', { signal }),
        apiFetch<ExecutionReviewsResponse>('/v1/execution-reviews?limit=50', { signal }),
        apiFetch<OpsEventsResponse>('/v1/system/ops-events?limit=30', { signal }).catch(
          (caught): OpsEventsResponse => ({
            ok: false,
            error: caught instanceof Error ? caught.message : 'Ops events could not be loaded.',
          }),
        ),
        apiFetch<RuntimeStatsResponse>('/v1/system/runtime-stats', { signal }).catch(() => null),
        apiFetch<WeeklyLifecycleReportCurrentResponse>('/v1/system/lifecycle-reports/current', { signal }).catch(() => null),
        apiFetch<{ items?: Array<Record<string, unknown>> }>('/v1/system/lifecycle-reviews', { signal }).catch(() => null),
        apiFetch<{ items?: Array<Record<string, unknown>> }>('/v1/system/lifecycle-reports/history?limit=12', { signal }).catch(() => ({ items: [] })),
      ])
      setHealth(healthResult)
      setOpsEvents(opsEventsResult)
      setRuntimeStats(runtimeStatsResult)
      setLifecycleReport(lifecycleResult)
      setLifecycleReviews(lifecycleReviewsResult?.items ?? [])
      const actionableFailures = [
        opsEventsResult.ok === true ? null : 'operational alerts',
        lifecycleReviewsResult && Array.isArray(lifecycleReviewsResult.items) ? null : 'lifecycle reviews',
      ].filter((value): value is string => value !== null)
      setActionableDataError(actionableFailures.length
        ? `${actionableFailures.join(' and ')} could not be loaded. Current status is unknown.`
        : null)
      setReportHistory(reportHistoryResult.items ?? [])
      const activeReviews = (reviewResult.items ?? []).filter(isOpenReview)
      setTemplates(templateResult.templates ?? {})
      setOpenReviewCount(Number(reviewResult.open_count ?? activeReviews.length))
      await refreshHealth()
      const actionDataIsComplete = opsEventsResult.ok === true
        && lifecycleReviewsResult !== null
        && Array.isArray(lifecycleReviewsResult.items)
      setActionableUpdatedAt(actionDataIsComplete ? Date.now() : null)
      setSnapshotUpdatedAt(Date.now())
    } catch (caught) {
      // Clear the previous snapshot so a failed refresh cannot leave stale green status on screen.
      setHealth(null)
      setOpsEvents(null)
      setRuntimeStats(null)
      setLifecycleReport(null)
      setLifecycleReviews([])
      setReportHistory([])
      setTemplates({})
      setOpenReviewCount(0)
      setActionableUpdatedAt(null)
      setSnapshotUpdatedAt(null)
      setError(caught instanceof Error ? caught.message : 'Operations data could not be loaded.')
    } finally {
      snapshotRefresh.current = false
      setLoading(false)
    }
  }, [refreshHealth])

  useEffect(() => {
    setFreshnessNow(Date.now())
    const timer = window.setInterval(() => setFreshnessNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const operationalSnapshotFresh = freshnessNow === null || isSnapshotFresh(snapshotUpdatedAt, freshnessNow)

  useEffect(() => {
    if (!snapshotUpdatedAt || operationalSnapshotFresh) return
    setHealth(null)
    setOpsEvents(null)
    setRuntimeStats(null)
    setLifecycleReport(null)
    setLifecycleReviews([])
    setReportHistory([])
    setTemplates({})
    setOpenReviewCount(0)
    setActionableUpdatedAt(null)
    setSnapshotUpdatedAt(null)
    setActionableDataError('Operational data is stale. Current status is unknown; refresh before acting.')
    setError('Operational data is stale. Refresh to load a current HIVE snapshot.')
  }, [operationalSnapshotFresh, snapshotUpdatedAt])

  const acceptLifecycleFix = useCallback(async (reviewId: string) => {
    const review = lifecycleReviews.find((item) => String(item.review_id) === reviewId)
    if (!review || !isSnapshotFresh(actionableUpdatedAt, Date.now()) || !hasCurrentLifecycleApproval(review)) {
      setReviewActionMessage('No current approval is available for this exact proposal and source revision. The action remains blocked.')
      return
    }
    if (!acquireActionLock(reviewActionLocks.current, reviewId)) return
    setReviewActionMessage('Recording decision and checking the exact PR head…')
    try {
      const idempotencyKey = await lifecycleIdempotencyKey(review)
      const response = await apiFetchWithMetadata<Record<string, unknown>>(
        `/v1/system/lifecycle-reviews/${encodeURIComponent(reviewId)}/accept-fix`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({
            expected_repository: review.repository,
            expected_head_sha: review.head_sha,
            expected_proposal_revision: review.proposal_revision,
          }),
        },
      )
      const result = response.data
      const message = result.dispatch === 'accepted'
        ? [
            `Repair handoff accepted by HIVE for ${String(review.repository || 'the reviewed repository')}`,
            `at ${String(review.head_sha || 'unknown SHA')}.`,
            `Request ID: ${response.requestId || 'not returned'}.`,
            'Verify the correlated run and post-change health before treating recovery as complete.',
          ].join(' ')
        : [
            `Decision recorded, but repair handoff is not confirmed (status: ${String(result.dispatch || 'unknown')}).`,
            'Do not retry until the current review and handoff state have been checked.',
          ].join(' ')
      setReviewActionMessage(message)
      await loadOps()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setReviewActionMessage(safeRepairHandoffFailure(caught.status, caught.requestId))
      } else {
        setReviewActionMessage('Repair handoff was not confirmed. Check HIVE’s current review and handoff state before retrying.')
      }
    } finally {
      releaseActionLock(reviewActionLocks.current, reviewId)
    }
  }, [actionableUpdatedAt, lifecycleReviews, loadOps])

  const deleteOpsEvents = useCallback(async () => {
    if (!opsEventDeleteTarget) return
    setOpsEventDeleteBusy(true)
    setOpsEventDeleteError(null)
    try {
      const query = opsEventDeleteTarget.clearAll
        ? '?clear_all=true'
        : `?event_id=${encodeURIComponent(opsEventDeleteTarget.eventId || '')}`
      await apiFetch<{ ok: boolean }>(`/v1/system/ops-events${query}`, { method: 'DELETE' })
      const deletedId = opsEventDeleteTarget.eventId
      setOpsEvents((current) => {
        if (!current) return current
        const currentItems = current.items ?? []
        return {
          ...current,
          items: opsEventDeleteTarget.clearAll
            ? []
            : currentItems.filter((item) => item.event_id !== deletedId),
          count: opsEventDeleteTarget.clearAll
            ? 0
            : Math.max(0, (current.count ?? currentItems.length) - 1),
        }
      })
      setOpsEventActionMessage(opsEventDeleteTarget.clearAll ? 'All operational alerts deleted.' : 'Operational alert deleted.')
      setOpsEventDeleteTarget(null)
    } catch (caught) {
      setOpsEventDeleteError(caught instanceof Error ? caught.message : 'Operational alert could not be deleted.')
    } finally {
      setOpsEventDeleteBusy(false)
    }
  }, [opsEventDeleteTarget])

  const previewDatabaseReset = useCallback(async () => {
    if (!selectedResetTarget) return
    setPurgeError(null)
    setPurgeResult(null)
    setPurgePreview(null)
    try {
      const result = await apiFetch<DatabaseResetPreview>('/v1/db/purge-reset/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: selectedResetTarget }),
      })
      setPurgePreview(result)
      if (!result.ok) setPurgeError('A complete row-count preview is unavailable. No reset can be started.')
    } catch (caught) {
      setPurgeError(caught instanceof Error ? caught.message : 'Reset preview could not be loaded.')
    }
  }, [selectedResetTarget])

  const purgeResetDatabases = useCallback(async () => {
    const target = resetTargets.find((item) => item.id === selectedResetTarget)
    if (!target || purgeConfirmation !== target.required_confirmation || purgePreview?.target !== target.id) return
    setPurgingDatabases(true)
    setPurgeError(null)
    setPurgeResult(null)
    try {
      const result = await apiFetch<DatabasePurgeResetResponse>('/v1/db/purge-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target.id, confirmation: purgeConfirmation }),
      })
      setPurgeResult(result)
      if (!result.ok) {
        setPurgeError('The selected reset did not complete. Inspect the returned result before retrying.')
        return
      }
      setPurgeDialogOpen(false)
      setPurgeConfirmation('')
      setPurgePreview(null)
      await loadOps()
    } catch (caught) {
      setPurgeError(caught instanceof Error ? caught.message : 'Database reset failed.')
    } finally {
      setPurgingDatabases(false)
    }
  }, [loadOps, purgeConfirmation, purgePreview, resetTargets, selectedResetTarget])

  useEffect(() => {
    let active = true
    void apiFetch<{ ok: boolean; targets: DatabaseResetTarget[] }>('/v1/db/purge-reset/targets')
      .then((result) => {
        if (!active) return
        setResetTargets(result.targets)
        setSelectedResetTarget(result.targets.find((target) => target.enabled)?.id ?? '')
      })
      .catch((caught) => {
        if (active) setPurgeError(caught instanceof Error ? caught.message : 'Reset targets could not be loaded.')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    void loadOps()
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void loadOps(true)
    }
    const timer = window.setInterval(refreshVisible, 60_000)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [loadOps])

  const templateEntries = useMemo(() => Object.entries(templates), [templates])
  const activeResetTarget = resetTargets.find((target) => target.id === selectedResetTarget)
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
  const currentReportHtmlHref = weeklyReportHtmlHref(lifecycleReport?.report)
  const openWeeklyReport = useCallback(async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    setWeeklyReportOpenError(null)
    if (!currentReportHtmlHref) return

    const reportWindow = window.open('about:blank', '_blank')
    if (!reportWindow) {
      setWeeklyReportOpenError('Allow pop-ups to open the weekly report.')
      return
    }
    reportWindow.opener = null
    reportWindow.document.title = 'Loading weekly report'
    reportWindow.document.body.textContent = 'Loading weekly report…'

    try {
      const response = await apiFetchWithMetadata<string>(currentReportHtmlHref)
      const mediaType = response.contentType?.split(';', 1)[0].trim().toLowerCase()
      if (mediaType !== 'text/html' || typeof response.data !== 'string' || !response.data.trimStart().startsWith('<!doctype html>')) {
        throw new Error('HIVE returned an invalid weekly report document.')
      }
      reportWindow.location.replace(`/api${currentReportHtmlHref}`)
    } catch {
      reportWindow.close()
      setWeeklyReportOpenError('The weekly HTML report could not be loaded. Refresh Operations and try again.')
    }
  }, [currentReportHtmlHref])

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <section className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-hive-panel/65 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">System operations</p>
              <StatusBadge status={health?.ok ? 'healthy' : health ? 'down' : loading ? 'checking' : 'unknown'} variant="operational" compact />
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

        {tab === 'overview' && <AudioNotificationSettings />}

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">
            {error} Operational status is unknown until a successful refresh.
          </div>
        )}

        {loading && !health ? (
          <div className="flex items-center justify-center py-20 text-slate-400"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading operational state</div>
        ) : tab === 'overview' ? (
          <>
            {actionableDataError && <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">{actionableDataError}</p>}
            {opsEvents?.items?.length ? (
              <details className="group mt-3 rounded-2xl border border-amber-300/15 bg-hive-panel/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white"><BellRing className="h-4 w-4 text-amber-300" /> Operational alerts</span>
                  <StatusBadge status={opsEvents.items.some((item) => item.severity === 'critical') ? 'critical' : 'warning'} label={`${opsEvents.count ?? 0} events`} compact />
                </summary>
                <div className="border-t border-white/6 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">Showing up to 6 recent alerts. You can remove one alert or clear the inbox.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setOpsEventDeleteError(null)
                        setOpsEventDeleteTarget({ clearAll: true })
                      }}
                      className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-300/10"
                    >
                      Delete all alerts
                    </button>
                  </div>
                  {opsEventActionMessage && <p role="status" className="mb-2 text-xs text-emerald-200">{opsEventActionMessage}</p>}
                  <div className="grid gap-2 lg:grid-cols-2">
                  {opsEvents.items.slice(0, 6).map((item) => (
                    <OpsEventCard
                      key={item.event_id}
                      item={item}
                      onInspect={() => {
                        acknowledgeHIVENotification(item.event_id)
                        inspect(item.title || 'Operational event', item, item.summary)
                      }}
                      onDelete={() => {
                        setOpsEventDeleteError(null)
                        setOpsEventDeleteTarget({ eventId: item.event_id, title: item.title || item.event_type || 'Operational event' })
                      }}
                    />
                  ))}
                  </div>
                </div>
              </details>
            ) : opsEvents === null || opsEvents.ok === false ? (
              <div role="status" className="mt-3 flex items-center justify-between rounded-xl border border-amber-300/15 bg-amber-300/5 px-4 py-3">
                <span className="flex items-center gap-2 text-xs text-slate-300"><BellRing className="h-4 w-4 text-amber-300" /> Operational alerts</span>
                <span className="text-xs font-medium text-amber-100">Unknown</span>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-white/8 bg-hive-panel/45 px-4 py-3">
                <span className="flex items-center gap-2 text-xs text-slate-400"><BellRing className="h-4 w-4 text-emerald-300" /> Operational alerts</span>
                <span className="text-xs font-medium text-emerald-200">None</span>
              </div>
            )}

            <section className="mt-3 rounded-2xl border border-white/8 bg-hive-panel/60 p-4" aria-labelledby="lifecycle-review-title">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="lifecycle-review-title" className="text-sm font-semibold text-white">
                    Needs My Review
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Only terminal states requiring a human decision appear here.
                  </p>
                </div>
                <StatusBadge
                  status={actionableDataError ? 'unknown' : lifecycleReviews.length ? 'warning' : 'ready'}
                  label={actionableDataError ? 'Unknown' : `${lifecycleReviews.length} open`}
                  compact
                />
              </div>
              {lifecycleReviews.length ? (
                <div className="mt-3 grid gap-2">
                  {lifecycleReviews.map((review) => {
                    const evidence = recordFrom(review.evidence)
                    const proposal = recordFrom(review.proposal)
                    const reviewId = String(review.review_id)
                    return (
                      <article
                        key={reviewId}
                        className="rounded-xl border border-amber-300/15 bg-hive-surface p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-semibold text-white">
                              {String(review.title || 'Review required')}
                            </h3>
                            <p className="mt-1 text-xs text-slate-400">
                              {String(review.source)} · PR #{String(review.pr_number || 'unknown')} ·{' '}
                              {String(review.head_sha || '')}
                            </p>
                            <p className="mt-1 text-xs text-slate-300">
                              {String(review.summary || '')}
                            </p>
                          </div>
                          {typeof review.action_url === 'string' && (
                            <a
                              href={review.action_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-cyan-200 underline"
                            >
                              Open PR
                            </a>
                          )}
                        </div>
                        <details className="mt-3 rounded-lg border border-white/8 px-3 py-2">
                          <summary
                            onClick={() => acknowledgeHIVENotification(reviewId)}
                            className="cursor-pointer text-xs text-cyan-200"
                          >
                            Review details
                          </summary>
                          <div className="mt-2 grid gap-2 text-xs text-slate-300">
                            <p>Failed check: {String(evidence.failed_check || 'Not identified')}</p>
                            <p>
                              Repair attempts: {String(evidence.repair_attempts ?? 0)} · Human hold:{' '}
                              {String(evidence.human_hold ?? 'unknown')}
                            </p>
                            <p>
                              Proposed solution:{' '}
                              {String(proposal.proposed_solution || 'No safe solution recorded; Accept Fix is disabled.')}
                            </p>
                            <p>
                              Repair prompt: {String(proposal.repair_prompt || 'No repair prompt recorded.')}
                            </p>
                            <p>Risk / impact: {String(proposal.risk_impact || 'Not recorded')}</p>
                          </div>
                        </details>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled
                            onClick={() => {
                              acknowledgeHIVENotification(reviewId)
                              void acceptLifecycleFix(reviewId)
                            }}
                            className="rounded-lg border border-cyan-200/20 px-3 py-2 text-xs text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {review.decision_recorded === true ? 'Decision recorded' : 'Accept Fix unavailable'}
                          </button>
                          {review.decision_recorded !== true && (
                            <span className="text-xs text-amber-200">
                              Blocked: individual operator identity and exact-revision approval are not available in this UI. Use the trusted operator channel.
                            </span>
                          )}
                          {review.decision_recorded === true && (
                            <span className="text-xs text-slate-400">
                              Dispatch: {String(review.dispatch_status || 'unknown')} · decision does not confirm repair completion
                            </span>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-400">
                  {actionableDataError ? 'Current review state is unknown.' : 'No unresolved human decision is recorded.'}
                </p>
              )}
              {reviewActionMessage && <p role="status" className="mt-2 text-xs text-slate-300">{reviewActionMessage}</p>}
            </section>

            <section className="mt-3 rounded-2xl border border-white/8 bg-hive-panel/60 p-4" aria-labelledby="weekly-lifecycle-report-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="weekly-lifecycle-report-title" className="text-sm font-semibold text-white">
                    Weekly repository overview
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Deterministic report from the durable HIVE evidence store.
                  </p>
                </div>
                {lifecycleReport?.available === true ? (
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      status={String((lifecycleReport.report as Record<string, unknown>)?.overall_status || 'unknown')}
                      compact
                    />
                    {currentReportHtmlHref && (
                      <a
                        href={currentReportHtmlHref ? `/api${currentReportHtmlHref}` : undefined}
                        onClick={openWeeklyReport}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-300/10"
                      >
                        View HTML report
                      </a>
                    )}
                    {weeklyReportOpenError && (
                      <p role="alert" className="text-xs text-rose-200">{weeklyReportOpenError}</p>
                    )}
                  </div>
                ) : (
                  <StatusBadge status="unknown" label="Not available" compact />
                )}
              </div>
              {lifecycleReport?.available === true ? (
                <p className="mt-2 text-xs text-slate-300">
                  Report {String((lifecycleReport.report as Record<string, unknown>)?.report_id || '')} ·
                  {' '}R2 key {String(lifecycleReport.r2_key || '')}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-400">
                  {lifecycleReport?.available === false
                    ? 'No persisted report is available for this ISO week yet. The weekly report job needs checking; missing evidence remains unknown.'
                    : 'The weekly report could not be loaded. It will be checked again automatically.'}
                </p>
              )}
              {lifecycleReport?.available === true &&
                Array.isArray((lifecycleReport.report as Record<string, unknown>)?.repositories) && (
                  <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                    {(
                      (lifecycleReport.report as Record<string, unknown>)
                        .repositories as Array<Record<string, unknown>>
                    ).map((item) => (
                      <li
                        key={String(item.repository)}
                        className="flex justify-between rounded-lg border border-white/6 px-3 py-2 text-xs"
                      >
                        <span className="text-slate-300">{String(item.repository)}</span>
                        <span className="flex items-center gap-2 text-slate-400">
                          {String(item.status)} · {String(item.evidence_count ?? 0)} evidence
                          {typeof item.report_url === 'string' && (
                            <a
                              href={item.report_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-200 underline underline-offset-2"
                            >
                              Open report
                            </a>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              {reportHistory.length > 0 && (
                <details className="mt-3 rounded-lg border border-white/8 px-3 py-2">
                  <summary className="cursor-pointer text-xs text-cyan-200">
                    Report history ({reportHistory.length})
                  </summary>
                  <ul className="mt-2 grid gap-2">
                    {reportHistory.map((item) => (
                      <li
                        key={String(item.report_id)}
                        className="flex items-center justify-between gap-3 text-xs text-slate-300"
                      >
                        <span>
                          {String(item.report_id)} · {String(item.overall_status)} ·{' '}
                          {item.evidence_complete === true ? 'complete' : 'incomplete'}
                        </span>
                        <span className="text-slate-500">{String(item.r2_key || '')}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

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
                <span className="text-[11px] text-slate-500">Scoped data cleanup</span>
              </summary>
              <div className="border-t border-rose-300/10 p-4">
                <p className="text-xs leading-5 text-slate-400">
                  Select one database, review its row counts, then confirm that target only. D1 migration history and database schemas are preserved.
                </p>
                <label className="mt-3 block text-xs font-medium text-slate-300" htmlFor="reset-target">Database to clean</label>
                <select
                  id="reset-target"
                  value={selectedResetTarget}
                  onChange={(event) => {
                    setSelectedResetTarget(event.target.value)
                    setPurgePreview(null)
                    setPurgeError(null)
                    setPurgeResult(null)
                  }}
                  disabled={!resetTargets.length || purgingDatabases}
                  className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-hive-surface px-3 text-sm text-white"
                >
                  {resetTargets.length === 0 && <option value="">No reset targets available</option>}
                  {resetTargets.map((target) => (
                    <option key={target.id} value={target.id} disabled={!target.enabled}>
                      {target.label}{target.enabled ? '' : ' (not configured)'}
                    </option>
                  ))}
                </select>
                {purgeResult?.ok && <p className="mt-2 text-xs font-medium text-emerald-200" role="status">{purgeResult.target} reset completed.</p>}
                {purgeError && <p className="mt-2 text-xs text-rose-200" role="alert">{purgeError}</p>}
                {purgePreview?.ok && purgePreview.target === selectedResetTarget && (
                  <div className="mt-3 rounded-xl border border-white/8 bg-hive-surface p-3">
                    <p className="text-xs font-semibold text-white">
                      Preview: {purgePreview.total_rows ?? 0} rows across {purgePreview.tables?.length ?? 0} tables
                    </p>
                    <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-400">
                      {purgePreview.tables?.map((table) => (
                        <li key={table.name} className="flex justify-between gap-3"><span className="truncate">{table.name}</span><span>{table.rows.toLocaleString()}</span></li>
                      ))}
                    </ul>
                    {purgePreview.preserved_tables?.length ? (
                      <p className="mt-2 text-[11px] text-slate-500">Preserved tables: {purgePreview.preserved_tables.join(', ')}</p>
                    ) : null}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void previewDatabaseReset()}
                  disabled={!activeResetTarget?.enabled || purgingDatabases}
                  className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Preview selected database
                </button>
                {purgePreview?.ok && purgePreview.target === selectedResetTarget && (purgePreview.total_rows ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPurgeConfirmation('')
                      setPurgeDialogOpen(true)
                    }}
                    disabled={purgingDatabases}
                    className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 text-xs font-semibold text-rose-100 disabled:opacity-50"
                  >
                    Review reset of {activeResetTarget?.label}
                  </button>
                )}
                {purgePreview?.ok && purgePreview.target === selectedResetTarget && purgePreview.total_rows === 0 && (
                  <p className="mt-2 text-xs text-slate-400">No rows to clear in this database.</p>
                )}
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
        open={Boolean(opsEventDeleteTarget)}
        title={opsEventDeleteTarget?.clearAll ? 'Delete all operational alerts?' : 'Delete this operational alert?'}
        summary={opsEventDeleteTarget?.clearAll
          ? 'This permanently removes every operational alert from the HIVE inbox and cannot be undone.'
          : 'This permanently removes the selected alert from the HIVE inbox and cannot be undone.'}
        objectName={opsEventDeleteTarget?.clearAll ? 'All stored operational alerts' : opsEventDeleteTarget?.title}
        systems={['HIVE event inbox']}
        confirmLabel={opsEventDeleteBusy ? 'Deleting…' : opsEventDeleteTarget?.clearAll ? 'Delete all alerts' : 'Delete alert'}
        tone="destructive"
        busy={opsEventDeleteBusy}
        error={opsEventDeleteError}
        onConfirm={() => void deleteOpsEvents()}
        onCancel={() => setOpsEventDeleteTarget(null)}
      />

      <ConfirmDialog
        open={purgeDialogOpen}
        title={`Reset ${activeResetTarget?.label ?? 'database'}?`}
        summary={activeResetTarget?.kind === 'sql'
          ? 'This clears HIVE SQL conversations, messages, file metadata and chunks, and cost records.'
          : 'This clears application rows from the selected D1 database while preserving its migration tables.'}
        objectName={activeResetTarget?.label}
        systems={[activeResetTarget?.kind === 'sql' ? 'HIVE SQL' : 'Cloudflare D1']}
        confirmLabel={purgingDatabases ? 'Resetting…' : 'Reset selected database'}
        cancelLabel="Keep data"
        tone="destructive"
        busy={purgingDatabases}
        confirmDisabled={!activeResetTarget || purgeConfirmation !== activeResetTarget.required_confirmation}
        error={purgeError}
        textInput={activeResetTarget ? {
          label: `Type ${activeResetTarget.required_confirmation} to confirm`,
          value: purgeConfirmation,
          onChange: setPurgeConfirmation,
          placeholder: activeResetTarget.required_confirmation,
          required: true,
        } : undefined}
        onConfirm={() => void purgeResetDatabases()}
        onCancel={() => {
          if (purgingDatabases) return
          setPurgeDialogOpen(false)
          setPurgeConfirmation('')
          setPurgeError(null)
        }}
      >
        <p>This action cannot be undone. It affects only the selected database. R2 objects, Vectorize data, Workers KV and Durable Object storage are not touched.</p>
        {purgePreview?.tables && (
          <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-hive-surface p-3 text-xs text-slate-400">
            {purgePreview.tables.map((table) => (
              <li key={table.name} className="flex justify-between gap-3"><span>{table.name}</span><span>{table.rows.toLocaleString()} rows</span></li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
    </div>
  )
}

