Warning: truncated output (original token count: 16281)
Total output lines: 1298

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
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
  const [lifecycleReport, setLifecycleReport] = useState<Record<string, unknown> | null>(null)
  const [reportHistory, setReportHistory] = useState<Array<Record<string, unknown>>>([])
  const [lifecycleReviews, setLifecycleReviews] = useState<Array<Record<string, unknown>>>([])
  const [reviewActionMessage, setReviewActionMessage] = useState('')
  const reviewActionLocks = useRef(new Set<string>())
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
  useEffect(() => {
    let active = true
    let refreshing = false
    const refreshActionable = async () => {
      if (document.visibilityState !== 'visible' || refreshing) return
      refreshing = true
      try {
        const [events, reviews] = await Promise.all([
          apiFetch<OpsEventsResponse>('/v1/system/ops-events?limit=30').catch(() => null),
          apiFetch<{ items?: Array<Record<string, unknown>> }>('/v1/system/lifecycle-reviews').catch(() => null),
        ])
        if (!active) return
        const failures: string[] = []
        if (events?.ok) setOpsEvents(events)
        else {
          setOpsEvents({ ok: false, error: 'Operational alerts are unavailable; the displayed state is unknown.' })
          failures.push('Operational alerts')
        }
        if (reviews && Array.isArray(reviews.items)) setLifecycleReviews(reviews.items)
        else {
          setLifecycleReviews([])
          failures.push('Lifecycle reviews')
        }
        setActionableDataError(failures.length ? `${failures.join(' and ')} could not be refreshed. No current status is available.` : null)
        setActionableUpdatedAt(failures.length ? null : Date.now())
      } finally {
        refreshing = false
      }
    }
    const timer = window.setInterval(() => {
      void refreshActionable()
    }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshActionable()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
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

  const loadOps = useCallback(async () => {
    setLoading(true)
    setError(null)
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
        apiFetch<Record<string, unknown>>('/v1/system/lifecycle-reports/current').catch(() => null),
        apiFetch<{ items?: Array<Record<string, unknown>> }>('/v1/system/lifecycle-reviews').catch(() => null),
        apiFetch<{ items?: Array<Record<string, unknown>> }>('/v1/system/lifecycle-reports/history?limit=12').catch(() => ({ items: [] })),
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
            : currentItems.filter((item) => item.event_id !== deletedI…6281 tokens truncated…-white/8 bg-hive-panel/60">
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
