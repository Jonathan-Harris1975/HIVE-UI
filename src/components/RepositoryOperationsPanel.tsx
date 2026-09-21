import {
  CheckCircle2,
  ChevronDown,
  Files,
  FolderGit2,
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
  Upload,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { apiFetch } from '../lib/api'
import { formatBytes } from '../lib/format'
import type {
  RepositoryBulkUploadItemResult,
  RepositoryBulkUploadResponse,
  RepositoryRefreshConfiguration,
  RepositoryRefreshJob,
  RepositorySummary,
  RepositoryUploadResponse,
} from '../types/api'

type UploadMode = 'single' | 'bulk'
type QueueState = 'queued' | 'uploading' | 'success' | 'failed' | 'duplicate' | 'unchanged' | 'updated'

type QueueItem = {
  id: string
  file: File
  state: QueueState
  repositoryId?: string | null
  fingerprint?: string | null
  indexedVersion?: number | null
  memoryStatus?: string | null
  intelligenceStatus?: string | null
  error?: string | null
  retryable?: boolean
}

interface RepositoryOperationsPanelProps {
  repositories: RepositorySummary[]
  refreshConfig: RepositoryRefreshConfiguration | null
  refreshConfigError: string | null
  onRepositoriesChanged: () => Promise<void>
  onRepositoryUploaded: (repositoryId: string) => void
}

const ACTIVE_REFRESH_STATUSES = new Set(['accepted', 'running'])
const TERMINAL_REFRESH_STATUSES = new Set(['completed', 'completed-with-failures', 'failed', 'cancelled'])
const REFRESH_POLL_INTERVAL_MS = 2_000
const REFRESH_POLL_LIMIT = 300

function queueId(file: File, index: number): string {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`
}

function isZip(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip')
}

function uploadResultState(result: RepositoryBulkUploadItemResult): QueueState {
  switch (result.status) {
    case 'failed': return 'failed'
    case 'duplicate': return 'duplicate'
    case 'unchanged': return 'unchanged'
    case 'updated': return 'updated'
    default: return 'success'
  }
}

function pipelineState(result: RepositoryBulkUploadItemResult, stage: 'memory' | 'intelligence'): string | null {
  if (stage === 'memory') {
    return result.memory_status
      ?? (result.pipeline?.memory_seed?.ok ? 'ready' : result.pipeline?.memory_seed?.error ? 'failed' : null)
  }
  return result.intelligence_status
    ?? (result.pipeline?.intelligence?.ok ? 'ready' : result.pipeline?.intelligence?.error ? 'failed' : null)
}

function resultForFile(results: RepositoryBulkUploadItemResult[], file: File, index: number) {
  return results.find((item) => item.filename === file.name) ?? results[index]
}

export function RepositoryOperationsPanel({
  repositories,
  refreshConfig,
  refreshConfigError,
  onRepositoriesChanged,
  onRepositoryUploaded,
}: RepositoryOperationsPanelProps) {
  const singleInputRef = useRef<HTMLInputElement | null>(null)
  const bulkInputRef = useRef<HTMLInputElement | null>(null)
  const refreshPollCount = useRef(0)
  const uploadInFlightRef = useRef(false)
  const [mode, setMode] = useState<UploadMode>('single')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [refreshJob, setRefreshJob] = useState<RepositoryRefreshJob | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshStarting, setRefreshStarting] = useState(false)

  const activeUpload = queue.some((item) => item.state === 'uploading')
  const queuedUpload = queue.some((item) => item.state === 'queued')
  const refreshActive = Boolean(refreshJob && ACTIVE_REFRESH_STATUSES.has(refreshJob.status))


  useEffect(() => {
    if (!refreshJob || !ACTIVE_REFRESH_STATUSES.has(refreshJob.status)) return undefined
    if (refreshPollCount.current >= REFRESH_POLL_LIMIT) {
      setRefreshError('Refresh status polling stopped after the bounded polling window. The job can be checked again safely.')
      return undefined
    }
    const jobId = refreshJob.job_id
    const timer = window.setTimeout(() => {
      refreshPollCount.current += 1
      void apiFetch<RepositoryRefreshJob>(`/v1/repositories/refresh-jobs/${encodeURIComponent(jobId)}`)
        .then(async (nextJob) => {
          setRefreshJob(nextJob)
          setRefreshError(null)
          if (TERMINAL_REFRESH_STATUSES.has(nextJob.status)) await onRepositoriesChanged()
        })
        .catch((caught) => {
          setRefreshError(caught instanceof Error ? caught.message : 'Repository refresh status could not be loaded.')
        })
    }, REFRESH_POLL_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [refreshJob, onRepositoriesChanged])

  function chooseFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    setUploadError(null)
    setUploadNotice(null)
    if (files.length === 0) {
      setQueue([])
      return
    }
    const selected = mode === 'single' ? files.slice(0, 1) : files
    const invalid = selected.find((file) => !isZip(file))
    if (invalid) {
      setUploadError(`${invalid.name} is not a ZIP archive.`)
      setQueue([])
      return
    }
    setQueue(selected.map((file, index) => ({ id: queueId(file, index), file, state: 'queued' })))
  }

  async function uploadSingle(item: QueueItem) {
    setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: 'uploading', error: null } : entry))
    const body = new FormData()
    body.append('upload', item.file)
    try {
      const response = await apiFetch<RepositoryUploadResponse>('/v1/repositories', { method: 'POST', body })
      setQueue((current) => current.map((entry) => entry.id === item.id ? {
        ...entry,
        state: 'success',
        repositoryId: response.repository_id,
        fingerprint: response.fingerprint,
        indexedVersion: response.indexed_version,
        memoryStatus: response.memory_status ?? (response.memory_ready ? 'ready' : 'not ready'),
        intelligenceStatus: response.intelligence_ready ? 'ready' : response.pipeline?.intelligence?.error ? 'failed' : null,
        retryable: false,
      } : entry))
      await onRepositoriesChanged()
      onRepositoryUploaded(response.repository_id)
      setUploadNotice(`${response.repository_id} accepted. Snapshot fingerprint ${response.fingerprint.slice(0, 12)}…`)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Repository upload failed.'
      setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: 'failed', error: message, retryable: true } : entry))
      setUploadError(message)
    }
  }

  async function uploadBulk(items: QueueItem[]) {
    setQueue((current) => current.map((entry) => items.some((item) => item.id === entry.id)
      ? { ...entry, state: 'uploading', error: null }
      : entry))
    const body = new FormData()
    items.forEach((item) => body.append('uploads', item.file))
    try {
      const response = await apiFetch<RepositoryBulkUploadResponse>('/v1/repositories/bulk', { method: 'POST', body })
      setQueue((current) => current.map((entry) => {
        const selectedIndex = items.findIndex((item) => item.id === entry.id)
        if (selectedIndex < 0) return entry
        const result = resultForFile(response.results ?? [], entry.file, selectedIndex)
        if (!result) return { ...entry, state: 'failed', error: 'The bulk response did not include this archive.', retryable: true }
        return {
          ...entry,
          state: uploadResultState(result),
          repositoryId: result.repository_id,
          fingerprint: result.fingerprint,
          indexedVersion: result.indexed_version,
          memoryStatus: pipelineState(result, 'memory'),
          intelligenceStatus: pipelineState(result, 'intelligence'),
          error: result.error,
          retryable: result.retryable ?? result.status === 'failed',
        }
      }))
      await onRepositoriesChanged()
      const successful = (response.results ?? []).filter((item) => item.status !== 'failed')
      const failed = (response.results ?? []).filter((item) => item.status === 'failed')
      setUploadNotice(`${successful.length}/${response.results.length} archive(s) completed; ${failed.length} failed.`)
      setUploadError(failed.length ? 'One or more repositories failed. Successful results remain available below.' : null)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Bulk repository upload failed.'
      setQueue((current) => current.map((entry) => items.some((item) => item.id === entry.id)
        ? { ...entry, state: 'failed', error: message, retryable: true }
        : entry))
      setUploadError(message)
    }
  }

  async function submitUpload() {
    if (uploadInFlightRef.current || activeUpload || !queuedUpload) return
    const queued = queue.filter((item) => item.state === 'queued')
    const first = queued[0]
    if (mode === 'single' && !first) return
    uploadInFlightRef.current = true
    setUploadError(null)
    setUploadNotice(null)
    try {
      if (mode === 'single') await uploadSingle(first as QueueItem)
      else await uploadBulk(queued)
    } finally {
      uploadInFlightRef.current = false
    }
  }

  async function retryItem(item: QueueItem) {
    if (uploadInFlightRef.current || activeUpload) return
    uploadInFlightRef.current = true
    setUploadError(null)
    setUploadNotice(null)
    try {
      if (mode === 'single') await uploadSingle(item)
      else await uploadBulk([item])
    } finally {
      uploadInFlightRef.current = false
    }
  }

  function resetUpload(modeToUse: UploadMode) {
    if (activeUpload) return
    setMode(modeToUse)
    setQueue([])
    setUploadError(null)
    setUploadNotice(null)
    if (singleInputRef.current) singleInputRef.current.value = ''
    if (bulkInputRef.current) bulkInputRef.current.value = ''
  }

  async function startRefreshAll() {
    setRefreshStarting(true)
    setRefreshError(null)
    refreshPollCount.current = 0
    try {
      const job = await apiFetch<RepositoryRefreshJob>('/v1/repositories/refresh-all', { method: 'POST' })
      setRefreshJob(job)
      if (TERMINAL_REFRESH_STATUSES.has(job.status)) await onRepositoriesChanged()
    } catch (caught) {
      setRefreshError(caught instanceof Error ? caught.message : 'Refresh all repositories could not be started.')
    } finally {
      setRefreshStarting(false)
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-2xl border border-white/8 bg-hive-panel/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Repository upload</p>
            <p className="mt-1 text-sm text-slate-300">Upload one repository or stage a visible multi-ZIP batch before submission.</p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/8 bg-hive-surface p-1" aria-label="Repository upload mode">
            <button
              type="button"
              aria-pressed={mode === 'single'}
              onClick={() => resetUpload('single')}
              disabled={activeUpload}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === 'single' ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-400'}`}
            >
              Upload one
            </button>
            <button
              type="button"
              aria-pressed={mode === 'bulk'}
              onClick={() => resetUpload('bulk')}
              disabled={activeUpload}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === 'bulk' ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-400'}`}
            >
              Bulk upload
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label
            className={[
              'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-300/20',
              'bg-cyan-300/10 px-4 text-xs font-semibold text-cyan-100',
              activeUpload ? 'pointer-events-none opacity-50' : '',
            ].join(' ')}
          >
            <Upload className="h-4 w-4" /> {mode === 'bulk' ? 'Choose repository ZIPs' : 'Choose repository ZIP'}
            <input
              ref={mode === 'single' ? singleInputRef : bulkInputRef}
              type="file"
              accept=".zip,application/zip"
              multiple={mode === 'bulk'}
              disabled={activeUpload}
              onChange={(event) => chooseFiles(event.target.files)}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => void submitUpload()}
            disabled={!queuedUpload || activeUpload}
            className={[
              'flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400',
              'to-emerald-300 px-4 text-xs font-semibold text-hive-accent-deep disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            {activeUpload ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Files className="h-4 w-4" />}
            {mode === 'bulk' ? `Submit ${queue.filter((item) => item.state === 'queued').length} archive(s)` : 'Upload repository'}
          </button>
        </div>

        {queue.length > 0 && (
          <div className="mt-4" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected queue</p>
            <div className="mt-2 space-y-2">
              {queue.map((item) => (
                <article key={item.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-all text-xs font-semibold text-slate-100">{item.file.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatBytes(item.file.size)}</p>
                    </div>
                    <StatusBadge
                      status={item.state === 'failed' ? 'error' : item.state === 'uploading' ? 'running' : item.state === 'queued' ? 'readonly' : 'ready'}
                      label={item.state.replace(/_/g, ' ')}
                      compact
                    />
                  </div>
                  {(item.repositoryId || item.fingerprint || item.memoryStatus || item.intelligenceStatus) && (
                    <div className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                      {item.repositoryId && <p>Repository: <span className="text-slate-200">{item.repositoryId}</span></p>}
                      {item.indexedVersion != null && <p>Indexed version: <span className="text-slate-200">v{item.indexedVersion}</span></p>}
                      {item.fingerprint && <p className="break-all">Fingerprint: <span className="font-mono text-slate-300">{item.fingerprint}</span></p>}
                      {item.memoryStatus && <p>Memory: <span className="text-slate-200">{item.memoryStatus}</span></p>}
                      {item.intelligenceStatus && <p>Intelligence: <span className="text-slate-200">{item.intelligenceStatus}</span></p>}
                    </div>
                  )}
                  {item.error && <p className="mt-2 text-xs leading-5 text-rose-200">{item.error}</p>}
                  {item.state === 'failed' && item.retryable !== false && (
                    <button
                      type="button"
                      onClick={() => void retryItem(item)}
                      disabled={activeUpload}
                      className="mt-2 flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 text-xs font-semibold text-amber-100 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Retry failed item
                    </button>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
        {uploadError && <div role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/8 px-3 py-2 text-xs text-rose-200">{uploadError}</div>}
        {uploadNotice && <div role="status" className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-3 py-2 text-xs text-emerald-100">{uploadNotice}</div>}
      </section>

      <details className="group rounded-2xl border border-white/8 bg-hive-panel/60 open:bg-hive-panel/70">
        <summary
          className={
            "flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5 " +
            "[&::-webkit-details-marker]:hidden"
          }
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Governed refresh</p>
            <p className="mt-1 text-sm text-slate-300">Refresh all configured repository snapshots and rebuild their governed state.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mx-4 flex flex-col gap-3 border-t border-white/8 pb-4 pt-4 sm:mx-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs text-slate-400">
            <p className="font-semibold text-slate-300">Refresh all repositories</p>
            <p className="mt-1">Runs the governed backend refresh and polls only while the job is active, with a bounded polling window.</p>
            {refreshConfigError && <p className="mt-1 text-rose-200">{refreshConfigError}</p>}
            {refreshConfig && !refreshConfig.configured && <p className="mt-1 text-amber-100">Governed refresh is not fully configured.</p>}
          </div>
          <button
            type="button"
            onClick={() => void startRefreshAll()}
            disabled={refreshStarting || refreshActive || refreshConfig?.enabled === false}
            className={[
              'flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-300/20',
              'bg-cyan-300/10 px-4 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            {refreshStarting || refreshActive ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {refreshActive
              ? 'Refresh in progress'
              : (refreshJob?.failed_count ?? 0) > 0
                ? 'Retry refresh all'
                : 'Refresh all repositories'}
          </button>
        </div>

        {refreshJob && (
          <div className="mx-4 mb-4 rounded-xl border border-white/8 bg-hive-surface/60 p-3 sm:mx-5" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-100">Job {refreshJob.job_id.slice(0, 12)}</p>
              <StatusBadge
                status={refreshJob.status === 'completed' ? 'ready' : refreshJob.status === 'failed' ? 'error' : refreshJob.status === 'completed-with-failures' ? 'warning' : 'running'}
                label={refreshJob.status.replace(/-/g, ' ')}
                compact
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>{refreshJob.completed_count}/{refreshJob.repository_count} terminal</span>
              <span>{refreshJob.failed_count} failed</span>
              {refreshJob.stage && <span>Stage: {refreshJob.stage}</span>}
            </div>
            {(refreshJob.results ?? []).length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(refreshJob.results ?? []).map((result) => (
                  <div key={result.repository_id} className="rounded-lg border border-white/8 bg-white/[0.025] p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-100">{result.repository_id}</p>
                      {result.ok === true ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-label="Succeeded" />
                      ) : result.ok === false ? (
                        <XCircle className="h-4 w-4 text-rose-300" aria-label="Failed" />
                      ) : (
                        <FolderGit2 className="h-4 w-4 text-slate-500" />
                      )}
                    </div>
                    <p className="mt-1 text-slate-400">{result.stage ?? result.pipeline_status ?? result.status ?? 'Processing'}</p>
                    {result.fingerprint && <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{result.fingerprint}</p>}
                    {result.memory_status && <p className="mt-1 text-slate-400">Memory: {result.memory_status}</p>}
                    {result.intelligence_status && <p className="text-slate-400">Intelligence: {result.intelligence_status}</p>}
                    {result.error && <p className="mt-1 text-rose-200">{result.error}</p>}
                  </div>
                ))}
              </div>
            )}
            {refreshJob.error && <p className="mt-2 text-xs text-rose-200">{refreshJob.error}</p>}
          </div>
        )}
        {refreshError && <div role="alert" className="mx-4 mb-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-3 py-2 text-xs text-rose-200 sm:mx-5">{refreshError}</div>}
      </details>
    </div>
  )
}
