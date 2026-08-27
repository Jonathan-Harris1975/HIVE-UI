import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  FileCode2,
  FolderGit2,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import { formatBytes, formatDate } from '../lib/format'
import type {
  RepositoryDiffResponse,
  RepositoryListResponse,
  RepositoryManifest,
  RepositoryRefreshConfiguration,
  RepositorySetupResponse,
  RepositorySummary,
  RepositoryUploadResponse,
} from '../types/api'

type PendingDelete = { repositoryId: string }
type NoticeTone = 'success' | 'warning'

function repositoryStatus(repo: RepositorySummary): { status: string; label: string; detail: string } {
  if (repo.rehydrated) {
    return {
      status: 'readonly',
      label: 'Legacy snapshot required',
      detail: 'The manifest exists, but this older registration has no durable source ZIP. Re-upload it once to make Repository Intelligence restart-safe.',
    }
  }
  if (repo.memory_status === 'unavailable') {
    return {
      status: 'error',
      label: 'Memory unavailable',
      detail: 'The working copy exists, but Repository Memory readiness cannot be verified in D1. Do not treat this repository as production-ready.',
    }
  }
  if (repo.memory_status && !repo.memory_ready) {
    return {
      status: 'warning',
      label: 'Setup incomplete',
      detail: 'The source snapshot is available, but automatic Memory or Repository Intelligence setup is incomplete. Use Retry setup after resolving the reported backend issue.',
    }
  }
  return {
    status: 'ready',
    label: 'Ready',
    detail: 'Source snapshot, Repository Memory and consolidated Repository Intelligence state are available. The ZIP and manifest are persisted in R2 for restart recovery.',
  }
}

function languageBreakdown(languages: Record<string, number>): { name: string; bytes: number; pct: number }[] {
  const total = Object.values(languages).reduce((sum, value) => sum + value, 0)
  if (total <= 0) return []
  return Object.entries(languages)
    .map(([name, bytes]) => ({ name, bytes, pct: (bytes / total) * 100 }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8)
}

export function RepositoriesPage() {
  const { setPayload, setOpen } = useInspector()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [repositories, setRepositories] = useState<RepositorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('success')

  const [uploading, setUploading] = useState(false)
  const [refreshConfig, setRefreshConfig] = useState<RepositoryRefreshConfiguration | null>(null)
  const [refreshConfigError, setRefreshConfigError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [manifest, setManifest] = useState<RepositoryManifest | null>(null)
  const [manifestLoading, setManifestLoading] = useState(false)
  const [manifestError, setManifestError] = useState<string | null>(null)

  const [diff, setDiff] = useState<RepositoryDiffResponse | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)

  const [reindexingId, setReindexingId] = useState<string | null>(null)
  const [settingUpId, setSettingUpId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadRepositories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<RepositoryListResponse>('/v1/repositories')
      setRepositories(response.repositories ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repositories could not be loaded.')
      setRepositories([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRepositories()
  }, [loadRepositories])

  useEffect(() => {
    let cancelled = false
    void apiFetch<RepositoryRefreshConfiguration>('/v1/repositories/refresh-config')
      .then((response) => {
        if (cancelled) return
        setRefreshConfig(response)
        setRefreshConfigError(null)
      })
      .catch((caught) => {
        if (cancelled) return
        setRefreshConfig(null)
        setRefreshConfigError(caught instanceof Error ? caught.message : 'Monthly refresh configuration could not be loaded.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadManifest = useCallback(async (repositoryId: string) => {
    setManifestLoading(true)
    setManifestError(null)
    setDiff(null)
    setDiffError(null)
    try {
      const response = await apiFetch<RepositoryManifest>(`/v1/repositories/${encodeURIComponent(repositoryId)}`)
      setManifest(response)
    } catch (caught) {
      setManifestError(caught instanceof Error ? caught.message : 'Manifest could not be loaded.')
      setManifest(null)
    } finally {
      setManifestLoading(false)
    }
  }, [])

  function selectRepository(repositoryId: string) {
    setSelectedId(repositoryId)
    void loadManifest(repositoryId)
  }

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setNotice(null)
    setNoticeTone('success')
    try {
      const body = new FormData()
      body.append('upload', file)
      const manifestResponse = await apiFetch<RepositoryUploadResponse>('/v1/repositories', { method: 'POST', body })
      const pipelineStatus = manifestResponse.pipeline?.status
      if (pipelineStatus === 'setup_incomplete') {
        const failed = manifestResponse.pipeline?.failed_stages?.join(', ') || 'one or more required stages'
        setNoticeTone('warning')
        setNotice(`${manifestResponse.repository_id} snapshot stored, but setup is incomplete (${failed}). Use Retry setup after the backend dependency is restored.`)
      } else if (pipelineStatus === 'ready_with_warnings') {
        const failed = manifestResponse.pipeline?.failed_stages?.join(', ') || 'optional services'
        setNoticeTone('warning')
        setNotice(`${manifestResponse.repository_id} registered and operational with optional warning(s): ${failed}.`)
      } else {
        setNotice(`${manifestResponse.repository_id} registered and ready (${manifestResponse.file_count} files, ${formatBytes(manifestResponse.total_bytes)}).`)
      }
      await loadRepositories()
      selectRepository(manifestResponse.repository_id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function runDiff(repositoryId: string) {
    setDiffLoading(true)
    setDiffError(null)
    try {
      const response = await apiFetch<RepositoryDiffResponse>(`/v1/repositories/${encodeURIComponent(repositoryId)}/diff`)
      setDiff(response)
    } catch (caught) {
      setDiffError(caught instanceof Error ? caught.message : 'Diff preview failed.')
      setDiff(null)
    } finally {
      setDiffLoading(false)
    }
  }

  async function runReindex(repositoryId: string) {
    setReindexingId(repositoryId)
    setError(null)
    setNotice(null)
    setNoticeTone('success')
    try {
      const response = await apiFetch<RepositoryManifest>(`/v1/repositories/${encodeURIComponent(repositoryId)}/reindex`, {
        method: 'POST',
      })
      setNotice(`${repositoryId} reindexed to version ${response.indexed_version}.`)
      await loadRepositories()
      if (selectedId === repositoryId) {
        setManifest(response)
        setDiff(null)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${repositoryId} could not be reindexed.`)
    } finally {
      setReindexingId(null)
    }
  }

  async function runSetup(repositoryId: string) {
    setSettingUpId(repositoryId)
    setError(null)
    setNotice(null)
    setNoticeTone('success')
    try {
      const response = await apiFetch<RepositorySetupResponse>(
        `/v1/repositories/${encodeURIComponent(repositoryId)}/setup`,
        { method: 'POST' },
      )
      if (response.ready) {
        setNotice(`${repositoryId} Memory and Repository Intelligence setup completed successfully.`)
      } else {
        const failed = response.pipeline.failed_stages?.join(', ') || 'one or more required stages'
        setNoticeTone('warning')
        setNotice(`${repositoryId} setup is still incomplete: ${failed}.`)
      }
      await loadRepositories()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${repositoryId} setup could not be completed.`)
    } finally {
      setSettingUpId(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setNoticeTone('success')
    try {
      await apiFetch(`/v1/repositories/${encodeURIComponent(pendingDelete.repositoryId)}`, { method: 'DELETE' })
      setNotice(`${pendingDelete.repositoryId} removed from the registry.`)
      if (selectedId === pendingDelete.repositoryId) {
        setSelectedId(null)
        setManifest(null)
        setDiff(null)
      }
      setPendingDelete(null)
      await loadRepositories()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository could not be removed.')
    } finally {
      setDeleting(false)
    }
  }

  function inspectRepository(summary: RepositorySummary) {
    setPayload({
      eyebrow: 'Repository',
      title: summary.repository_id,
      description: `Registered from ${summary.source_filename}, indexed version ${summary.indexed_version}.`,
      rows: [
        { label: 'Fingerprint', value: summary.fingerprint },
        { label: 'Files', value: String(summary.file_count) },
        { label: 'Size', value: formatBytes(summary.total_bytes) },
        { label: 'Created', value: formatDate(new Date(summary.created_at * 1000).toISOString()) },
        { label: 'Updated', value: formatDate(new Date(summary.updated_at * 1000).toISOString()) },
      ],
      json: summary,
    })
    setOpen(true)
  }

  const totalFiles = useMemo(() => repositories.reduce((sum, repo) => sum + repo.file_count, 0), [repositories])
  const totalBytes = useMemo(() => repositories.reduce((sum, repo) => sum + repo.total_bytes, 0), [repositories])

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-hive-panel/75 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Repository manager</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Registered repository snapshots</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Upload a zipped repository to build Repository Memory and consolidated Repository Intelligence. Repository IDs are stable,
                monthly uploads replace the same governed snapshot, and production stores both the source ZIP and manifest
                in R2 so the working copy is restored automatically after backend restarts.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadRepositories()}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 hover:bg-white/[0.07]"
              >
                <RefreshCcw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/8 pt-5">
            <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-hive-accent-deep">
              {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Upload repository (.zip)'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={(event) => void handleUpload(event.target.files)}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">
              {repositories.length} registered
            </span>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">{totalFiles} files</span>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">{formatBytes(totalBytes)}</span>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/8 bg-hive-panel/60 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Monthly repository automation</p>
              <p className="mt-1 text-sm text-slate-300">
                MAST triggers a fresh governed GitHub snapshot after the second-Saturday AIMS/RAMS audit, then HIVE runs Repository Intelligence for every configured repository.
              </p>
            </div>
            {refreshConfig ? (
              <StatusBadge
                status={refreshConfig.configured ? 'ready' : 'error'}
                label={refreshConfig.configured ? `Ready · ${refreshConfig.repository_count}/${refreshConfig.expected_repository_count} repos · ${refreshConfig.branch}` : 'Not configured'}
                compact
              />
            ) : refreshConfigError ? (
              <StatusBadge status="error" label="Configuration unavailable" compact />
            ) : (
              <StatusBadge status="readonly" label="Checking" compact />
            )}
          </div>
          {refreshConfig?.configured && (
            <p className="mt-2 text-xs text-emerald-200/80">
              Trigger: {refreshConfig.trigger}. HIVE replaces all governed snapshots and runs Repository Intelligence automatically.
            </p>
          )}
          {refreshConfig && !refreshConfig.configured && (
            <p className="mt-2 text-xs text-rose-200">
              Monthly automation is not production-ready. {refreshConfig.missing_repository_ids.length ? `Missing repositories: ${refreshConfig.missing_repository_ids.join(', ')}. ` : ''}{!refreshConfig.github_token_configured ? 'GitHub access is not configured. ' : ''}Check HIVE repository refresh configuration before relying on the scheduled run.
            </p>
          )}
          {refreshConfigError && <p className="mt-2 text-xs text-rose-200">{refreshConfigError}</p>}
        </section>

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              noticeTone === 'warning'
                ? 'border-amber-300/20 bg-amber-300/8 text-amber-100'
                : 'border-emerald-300/20 bg-emerald-300/8 text-emerald-100'
            }`}
          >
            {notice}
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <section>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              <FolderGit2 className="h-4 w-4" /> Registered repositories
            </h3>

            {loading ? (
              <div className="mt-4 flex items-center justify-center py-16 text-slate-400">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading repositories
              </div>
            ) : repositories.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<FolderGit2 className="h-5 w-5" />}
                  title="No repositories registered yet."
                  body="Upload a zipped repository above to build Repository Memory and run consolidated Repository Intelligence."
                />
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {repositories.map((repo) => {
                  const availability = repositoryStatus(repo)
                  return (
                  <article
                    key={repo.repository_id}
                    className={`rounded-2xl border p-4 transition ${
                      selectedId === repo.repository_id
                        ? 'border-cyan-300/30 bg-cyan-300/[0.05]'
                        : 'border-white/8 bg-hive-panel/70 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => selectRepository(repo.repository_id)} className="min-w-0 text-left">
                        <h4 className="truncate text-sm font-semibold text-white">{repo.repository_id}</h4>
                        <p className="mt-0.5 truncate text-xs text-slate-400">{repo.source_filename}</p>
                      </button>
                      <StatusBadge status={availability.status} label={availability.label} compact />
                    </div>
                    <p className={`mt-2 text-xs leading-5 ${availability.status === 'ready' ? 'text-slate-500' : 'text-amber-200/80'}`}>
                      {availability.detail}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="rounded-full border border-white/10 px-2 py-0.5">{repo.file_count} files</span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5">{formatBytes(repo.total_bytes)}</span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5">v{repo.indexed_version}</span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5">
                        Updated {formatDate(new Date(repo.updated_at * 1000).toISOString())}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => inspectRepository(repo)}
                        className="h-8 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07]"
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => void runDiff(repo.repository_id)}
                        disabled={repo.rehydrated}
                        title={repo.rehydrated ? 'Re-upload required: no working copy to diff against.' : undefined}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs text-slate-300 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.04]"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" /> Diff
                      </button>
                      <button
                        type="button"
                        onClick={() => void runReindex(repo.repository_id)}
                        disabled={reindexingId === repo.repository_id || repo.rehydrated}
                        title={repo.rehydrated ? 'Re-upload required: no working copy to reindex.' : undefined}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {reindexingId === repo.repository_id ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-3.5 w-3.5" />
                        )}
                        Reindex
                      </button>
                      {!repo.memory_ready && !repo.rehydrated && (
                        <button
                          type="button"
                          onClick={() => void runSetup(repo.repository_id)}
                          disabled={settingUpId === repo.repository_id}
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 text-xs text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {settingUpId === repo.repository_id ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCcw className="h-3.5 w-3.5" />
                          )}
                          Retry setup
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPendingDelete({ repositoryId: repo.repository_id })}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-300/20 bg-rose-300/8 px-3 text-xs text-rose-200 hover:bg-rose-300/12"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </article>
                  )
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              <Boxes className="h-4 w-4" /> Manifest detail
            </h3>

            {!selectedId ? (
              <div className="mt-3">
                <EmptyState
                  icon={<FileCode2 className="h-5 w-5" />}
                  title="Select a repository to inspect its manifest."
                  body="Language breakdown, dependency manifests and a diff preview against the last index will appear here."
                />
              </div>
            ) : manifestLoading ? (
              <div className="mt-4 flex items-center justify-center py-16 text-slate-400">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading manifest
              </div>
            ) : manifestError ? (
              <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{manifestError}</div>
            ) : manifest ? (
              <div className="mt-3 space-y-4">
                <article className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4">
                  <h4 className="text-sm font-semibold text-white">{manifest.repository_id}</h4>
                  <p className="mt-1 truncate font-mono text-xs text-slate-500">{manifest.fingerprint}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4">
                    <div className="rounded-lg border border-white/8 px-2.5 py-2 text-center">
                      <p className="text-sm font-semibold text-white">{manifest.file_count}</p>
                      <p>Files</p>
                    </div>
                    <div className="rounded-lg border border-white/8 px-2.5 py-2 text-center">
                      <p className="text-sm font-semibold text-white">{formatBytes(manifest.total_bytes)}</p>
                      <p>Size</p>
                    </div>
                    <div className="rounded-lg border border-white/8 px-2.5 py-2 text-center">
                      <p className="text-sm font-semibold text-white">v{manifest.indexed_version}</p>
                      <p>Index</p>
                    </div>
                    <div className="rounded-lg border border-white/8 px-2.5 py-2 text-center">
                      <p className="text-sm font-semibold text-white">{manifest.dependencies.length}</p>
                      <p>Manifests</p>
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Language breakdown</h4>
                  {languageBreakdown(manifest.languages).length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No languages detected.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {languageBreakdown(manifest.languages).map((entry) => (
                        <div key={entry.name}>
                          <div className="flex items-center justify-between text-xs text-slate-300">
                            <span>{entry.name}</span>
                            <span className="text-slate-500">{formatBytes(entry.bytes)}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300" style={{ width: `${entry.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Dependency manifests</h4>
                  {manifest.dependencies.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No dependency manifests found.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {manifest.dependencies.map((dep) => (
                        <div key={dep.manifest_path} className="rounded-lg border border-white/6 bg-white/[0.025] px-3 py-2">
                          <p className="text-xs font-medium text-slate-100">{dep.manifest_path}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {dep.ecosystem} · {dep.declared.length} declared {dep.declared.length === 1 ? 'dependency' : 'dependencies'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="rounded-2xl border border-white/8 bg-hive-panel/70 p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Diff since last index</h4>
                    <button
                      type="button"
                      onClick={() => void runDiff(manifest.repository_id)}
                      disabled={diffLoading}
                      className="flex h-7 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-2.5 text-xs text-slate-300 hover:bg-white/[0.07] disabled:opacity-50"
                    >
                      {diffLoading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <ArrowRightLeft className="h-3 w-3" />} Preview
                    </button>
                  </div>
                  {diffError && <p className="mt-2 text-xs text-rose-300">{diffError}</p>}
                  {!diff && !diffError && <p className="mt-2 text-xs text-slate-500">Run a preview to see changes without reindexing.</p>}
                  {diff && (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-2 py-2">
                        <p className="flex items-center justify-center gap-1 font-semibold text-emerald-200"><Plus className="h-3 w-3" /> {diff.added.length}</p>
                        <p className="mt-1 text-slate-500">Added</p>
                      </div>
                      <div className="rounded-lg border border-rose-300/15 bg-rose-300/[0.04] px-2 py-2">
                        <p className="flex items-center justify-center gap-1 font-semibold text-rose-200"><Minus className="h-3 w-3" /> {diff.removed.length}</p>
                        <p className="mt-1 text-slate-500">Removed</p>
                      </div>
                      <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] px-2 py-2">
                        <p className="flex items-center justify-center gap-1 font-semibold text-cyan-200"><ArrowRightLeft className="h-3 w-3" /> {diff.changed.length}</p>
                        <p className="mt-1 text-slate-500">Changed</p>
                      </div>
                    </div>
                  )}
                </article>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Remove repository"
        summary="This deletes the registered working copy, durable R2 manifest/source snapshot, and Repository Memory for this repository. It can be re-uploaded later as a new governed snapshot."
        objectName={pendingDelete?.repositoryId}
        systems={['Repository Manager', 'Repository QA', 'Repository Council']}
        confirmLabel="Remove repository"
        tone="destructive"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      >
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
          Any in-progress QA, learning, or council runs referencing this repository will lose their working copy.
        </p>
      </ConfirmDialog>
    </div>
  )
}
