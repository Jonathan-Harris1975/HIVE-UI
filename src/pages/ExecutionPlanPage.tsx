import {
  AlertTriangle,
  Boxes,
  Database,
  ClipboardCheck,
  History,
  Layers,
  ListChecks,
  LoaderCircle,
  PlayCircle,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { WorkflowGraph } from '../components/WorkflowGraph'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import type {
  ExecutionPreviewDetailResponse,
  ExecutionReviewCreateResponse,
  ExecutionPreviewHistoryResponse,
  ExecutionPreviewSaveResponse,
  PolicyProfile,
  PolicyProfilesResponse,
  SavedExecutionPreviewSummary,
  WorkflowSimulationResponse,
} from '../types/api'

export function ExecutionPlanPage() {
  const [task, setTask] = useState('')
  const [repo, setRepo] = useState('')
  const [preset, setPreset] = useState('')
  const [policyProfileInput, setPolicyProfileInput] = useState('')

  const [profiles, setProfiles] = useState<Record<string, PolicyProfile>>({})
  const [profilesLoading, setProfilesLoading] = useState(true)

  const [simulating, setSimulating] = useState(false)
  const [simulation, setSimulation] = useState<WorkflowSimulationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewPlanId, setReviewPlanId] = useState<string | null>(null)
  const [savedPreviewId, setSavedPreviewId] = useState<string | null>(null)

  const [history, setHistory] = useState<SavedExecutionPreviewSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [selectedPreview, setSelectedPreview] = useState<Record<string, unknown> | null>(null)
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await apiFetch<ExecutionPreviewHistoryResponse>('/v1/execution-preview/history')
      setHistory(response.items ?? [])
    } catch (caught) {
      setHistory([])
      setError(caught instanceof Error ? caught.message : 'Execution preview history could not be loaded.')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    apiFetch<PolicyProfilesResponse>('/v1/execution-preview/policy-profiles')
      .then((response) => setProfiles(response.profiles ?? {}))
      .catch(() => setProfiles({}))
      .finally(() => setProfilesLoading(false))
    void loadHistory()
  }, [loadHistory])

  async function runSimulation(event: FormEvent) {
    event.preventDefault()
    if (!task.trim()) return
    setSimulating(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<WorkflowSimulationResponse>('/v1/workflow-simulation', {
        method: 'POST',
        body: JSON.stringify({
          task: task.trim(),
          repo: repo.trim() || null,
          workflow_preset: preset.trim() || null,
          policy_profile: policyProfileInput || null,
        }),
      })
      if (!response.ok) {
        setError(response.error_code ? `Preview failed: ${response.error_code}` : 'Preview failed.')
        return
      }
      setSimulation(response)
      setReviewPlanId(null)
      setSavedPreviewId(null)
      setSelectedPreview(null)
      setSelectedPreviewId(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview failed.')
    } finally {
      setSimulating(false)
    }
  }

  async function persistPreview(): Promise<ExecutionPreviewSaveResponse | null> {
    if (!simulation) return null
    const response = await apiFetch<ExecutionPreviewSaveResponse>('/v1/execution-preview/save', {
      method: 'POST',
      body: JSON.stringify({
        task: simulation.task,
        repo: simulation.repo,
        workflow_preset: simulation.workflow_preset ?? null,
        policy_profile: simulation.policy_profile,
        preview_id: simulation.preview_id || null,
        simulation_id: simulation.simulation_id || null,
        dry_run: false,
      }),
    })
    if (!response.ok) {
      setError('Preview could not be saved (D1 may be disabled on this deployment).')
      return null
    }
    setSavedPreviewId(response.preview_id)
    const savedSimulation = response.preview?.simulation
    if (savedSimulation && typeof savedSimulation === 'object' && !Array.isArray(savedSimulation)) {
      setSimulation(savedSimulation as WorkflowSimulationResponse)
    }
    await loadHistory()
    return response
  }

  async function savePreview() {
    if (!simulation) return
    if (savedPreviewId) {
      setNotice(`Preview ${savedPreviewId} is already saved.`)
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await persistPreview()
      if (response) setNotice(`Preview ${response.preview_id} saved to history.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function sendToReview() {
    if (!simulation?.task) return
    setSubmittingReview(true)
    setError(null)
    setNotice(null)
    try {
      let sourcePreviewId = savedPreviewId
      let sourceSimulationId = simulation.simulation_id || null
      if (!sourcePreviewId) {
        const saved = await persistPreview()
        if (!saved) return
        sourcePreviewId = saved.preview_id
        const persistedSimulationId = saved.preview?.simulation_id
        if (typeof persistedSimulationId === 'string') sourceSimulationId = persistedSimulationId
      }

      const response = await apiFetch<ExecutionReviewCreateResponse>('/v1/execution-reviews', {
        method: 'POST',
        body: JSON.stringify({
          task: simulation.task,
          repo: simulation.repo,
          workflow_preset: simulation.workflow_preset ?? null,
          policy_profile: simulation.policy_profile || null,
          source_preview_id: sourcePreviewId,
          source_simulation_id: sourceSimulationId,
          dry_run: false,
        }),
      })
      if (!response.ok) {
        const mismatches = response.mismatch_fields?.length
          ? ` Mismatched fields: ${response.mismatch_fields.join(', ')}.`
          : ''
        setError(`${response.message || 'Review plan could not be created.'}${mismatches}`)
        return
      }
      setReviewPlanId(response.plan_id)
      setNotice(`Review plan ${response.plan_id} created from saved preview ${sourcePreviewId}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review plan could not be created.')
    } finally {
      setSubmittingReview(false)
    }
  }

  async function loadSavedPreview(previewId: string) {
    setSelectedPreviewId(previewId)
    setSelectedPreview(null)
    try {
      const response = await apiFetch<ExecutionPreviewDetailResponse>(`/v1/execution-preview/${encodeURIComponent(previewId)}`)
      if (response.ok) setSelectedPreview(response.preview)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Saved preview could not be loaded.')
    }
  }

  const graph = simulation?.workflow_graph

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-hive-panel/75 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Execution planning</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Preview a controlled execution plan</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Build a deterministic planning estimate before anything is approved or handed to an execution adapter.
            The preview does not mutate a repository, write to R2, call models, or start background work.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
            {['Preview', 'Review', 'Approve', 'Execute'].map((step, index) => (
              <div
                key={step}
                className={`rounded-lg border px-2 py-2 ${
                  index === 0
                    ? 'border-cyan-300/25 bg-cyan-300/8 text-cyan-100'
                    : 'border-white/8 text-slate-500'
                }`}
              >
                {index + 1}. {step}
              </div>
            ))}
          </div>

          <form onSubmit={runSimulation} className="mt-6 space-y-2 border-t border-white/8 pt-5">
            <textarea
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="Describe the task to preview…"
              aria-label="Task to preview"
              rows={3}
              className="w-full resize-none rounded-xl border border-white/8 bg-hive-surface px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
            />
            <div className="flex flex-wrap gap-2">
              <input
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
                placeholder="Repo (optional)"
                aria-label="Repository"
                className="h-9 flex-1 rounded-lg border border-white/8 bg-hive-surface px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500"
              />
              <input
                value={preset}
                onChange={(event) => setPreset(event.target.value)}
                placeholder="Workflow preset (optional)"
                aria-label="Workflow preset"
                className="h-9 flex-1 rounded-lg border border-white/8 bg-hive-surface px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500"
              />
              <select
                value={policyProfileInput}
                aria-label="Policy profile"
                onChange={(event) => setPolicyProfileInput(event.target.value)}
                className="h-9 rounded-lg border border-white/8 bg-hive-surface px-3 text-xs text-slate-300 outline-none"
              >
                <option value="">Default policy</option>
                {Object.entries(profiles).map(([key, profile]) => (
                  <option key={key} value={key}>{profile.label}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={simulating || !task.trim()}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-hive-accent-deep disabled:opacity-50"
              >
                {simulating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />} Preview plan
              </button>
            </div>
          </form>
        </section>

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

        {simulation && (
          <section className="mt-6 rounded-3xl border border-white/8 bg-hive-panel/70 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-white">{simulation.task}</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void savePreview()}
                  disabled={saving || Boolean(savedPreviewId)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-50"
                >
                  {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {savedPreviewId ? 'Preview saved' : 'Save preview'}
                </button>
                <button
                  type="button"
                  onClick={() => void sendToReview()}
                  disabled={submittingReview || Boolean(reviewPlanId)}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-300 px-3 text-xs font-semibold text-hive-accent-deep disabled:opacity-50"
                >
                  {submittingReview ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                  {reviewPlanId ? 'Sent to review' : 'Send to review'}
                </button>
                {reviewPlanId && (
                  <Link
                    to="/execution-reviews"
                    className="flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-slate-300"
                  >
                    Open reviews
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={simulation.execution_state ?? 'unknown'} compact />
              {simulation.policy && (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-400">{simulation.policy.label}</span>
              )}
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-400">
                {simulation.can_execute_now ? 'Can execute now' : 'Awaiting approval'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Layers className="h-3.5 w-3.5" /> Service requirements
                </h4>
                {(simulation.required_services ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">None identified.</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {simulation.required_services!.map((service) => (
                      <div key={service.service} className="flex items-start justify-between gap-2 text-xs">
                        <span className="text-slate-300" title={service.purpose}>{service.service}</span>
                        <span className={service.required ? 'text-cyan-200' : 'text-slate-500'}>
                          {service.required ? 'required' : 'conditional'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><Boxes className="h-3.5 w-3.5" /> Affected surfaces</h4>
                <p className="mt-2 text-xs text-slate-400">Repos: {(simulation.affected_repos ?? []).join(', ') || 'none'}</p>
                <p className="mt-1 text-xs text-slate-400">Buckets: {(simulation.affected_buckets ?? []).join(', ') || 'none'}</p>
              </article>

              {simulation.estimated_cost && (
                <article className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><Database className="h-3.5 w-3.5" /> Estimated cost</h4>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-hive-canvas p-2 font-mono text-xs text-slate-400">
                    {JSON.stringify(simulation.estimated_cost, null, 2)}
                  </pre>
                </article>
              )}

              {simulation.risk_summary && (
                <article className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><ShieldCheck className="h-3.5 w-3.5" /> Risk summary</h4>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-hive-canvas p-2 font-mono text-xs text-slate-400">
                    {JSON.stringify(simulation.risk_summary, null, 2)}
                  </pre>
                </article>
              )}
            </div>

            {(simulation.missing_prerequisites ?? []).length > 0 && (
              <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> Missing prerequisites</p>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-5 text-amber-100">
                  {simulation.missing_prerequisites!.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </div>
            )}

            {(simulation.rollback_notes ?? []).length > 0 && (
              <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><ShieldCheck className="h-3.5 w-3.5" /> Change safety</p>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-5 text-slate-400">
                  {simulation.rollback_notes!.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </div>
            )}

            {graph?.nodes && graph.nodes.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300"><ListChecks className="h-3.5 w-3.5" /> Workflow graph</h4>
                <WorkflowGraph nodes={graph.nodes} edges={graph.edges ?? []} />
              </div>
            )}
          </section>
        )}

        <details className="ui-disclosure mt-6">
          <summary>
            <span className="flex items-center gap-2"><History className="h-4 w-4" /> Saved preview history</span>
            <span className="ui-disclosure-count">{history.length}</span>
          </summary>
          <div className="ui-disclosure-body">
          {historyLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading history</div>
          ) : history.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon={<History className="h-5 w-5" />} title="No saved previews yet." body="Run a preview above and save it to build history." />
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {history.map((item) => (
                <button
                  key={item.preview_id}
                  type="button"
                  onClick={() => void loadSavedPreview(item.preview_id)}
                  className={`rounded-xl border p-3 text-left ${
                    selectedPreviewId === item.preview_id ? 'border-cyan-300/30 bg-cyan-300/[0.05]' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <p className="truncate text-xs font-medium text-slate-100">{item.task}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <StatusBadge status={item.status} compact />
                    {item.repo && <span>{item.repo}</span>}
                    {item.created_at && <span>{formatDate(item.created_at)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedPreview && (
            <pre className="mt-3 max-h-96 overflow-auto rounded-xl border border-white/8 bg-hive-canvas p-3 font-mono text-xs leading-5 text-slate-300">
              {JSON.stringify(selectedPreview, null, 2)}
            </pre>
          )}
          </div>
        </details>

        <details className="ui-disclosure mt-3">
          <summary>Policy profiles</summary>
          <div className="ui-disclosure-body">
          {profilesLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading profiles</div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(profiles).map(([key, profile]) => (
                <article key={key} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <p className="text-xs font-semibold text-slate-100">{profile.label}</p>
                  <p className="mt-1 text-xs leading-4 text-slate-500">{profile.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-500">
                    {profile.allows_repo_mutation && <span className="rounded-full border border-white/10 px-1.5 py-0.5">repo mutation</span>}
                    {profile.allows_r2_write && <span className="rounded-full border border-white/10 px-1.5 py-0.5">R2 write</span>}
                    {profile.requires_human_approval && <span className="rounded-full border border-amber-300/20 px-1.5 py-0.5 text-amber-200">approval required</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
          </div>
        </details>
      </div>
    </div>
  )
}
