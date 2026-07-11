import {
  AlertTriangle,
  Boxes,
  Database,
  History,
  Layers,
  ListChecks,
  LoaderCircle,
  PlayCircle,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { WorkflowGraph } from '../components/WorkflowGraph'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import type {
  ExecutionPreviewDetailResponse,
  ExecutionPreviewHistoryResponse,
  ExecutionPreviewSaveResponse,
  PolicyProfile,
  PolicyProfilesResponse,
  SavedExecutionPreviewSummary,
  WorkflowSimulationResponse,
} from '../types/api'

export function ExecutionSimulationPage() {
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
        setError(response.error_code ? `Simulation failed: ${response.error_code}` : 'Simulation failed.')
        return
      }
      setSimulation(response)
      setSelectedPreview(null)
      setSelectedPreviewId(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Simulation failed.')
    } finally {
      setSimulating(false)
    }
  }

  async function savePreview() {
    if (!simulation) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<ExecutionPreviewSaveResponse>('/v1/execution-preview/save', {
        method: 'POST',
        body: JSON.stringify({
          task: simulation.task,
          repo: simulation.repo,
          workflow_preset: preset.trim() || null,
          policy_profile: simulation.policy_profile,
          dry_run: false,
        }),
      })
      if (!response.ok) {
        setError('Preview could not be saved (D1 may be disabled on this deployment).')
        return
      }
      setNotice(`Preview ${response.preview_id} saved to history.`)
      await loadHistory()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview could not be saved.')
    } finally {
      setSaving(false)
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
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Execution simulation</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Pretend-mode workflow simulation</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Estimates services, risk, cost class and blockers for a task without executing any adapter, mutating a
            repo, writing to R2, or starting background work. Deterministic and safe to run repeatedly.
          </p>

          <form onSubmit={runSimulation} className="mt-6 space-y-2 border-t border-white/8 pt-5">
            <textarea
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="Describe the task to simulate…"
              rows={3}
              className="w-full resize-none rounded-xl border border-white/8 bg-[#071426] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
            />
            <div className="flex flex-wrap gap-2">
              <input
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
                placeholder="Repo (optional)"
                className="h-9 flex-1 rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500"
              />
              <input
                value={preset}
                onChange={(event) => setPreset(event.target.value)}
                placeholder="Workflow preset (optional)"
                className="h-9 flex-1 rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-500"
              />
              <select
                value={policyProfileInput}
                onChange={(event) => setPolicyProfileInput(event.target.value)}
                className="h-9 rounded-lg border border-white/8 bg-[#071426] px-3 text-xs text-slate-300 outline-none"
              >
                <option value="">Default policy</option>
                {Object.entries(profiles).map(([key, profile]) => (
                  <option key={key} value={key}>{profile.label}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={simulating || !task.trim()}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-50"
              >
                {simulating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />} Simulate
              </button>
            </div>
          </form>
        </section>

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

        {simulation && (
          <section className="mt-6 rounded-3xl border border-white/8 bg-[#0a192d]/70 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{simulation.task}</h3>
              <button
                type="button"
                onClick={() => void savePreview()}
                disabled={saving}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-50"
              >
                {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save to history
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
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
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><Layers className="h-3.5 w-3.5" /> Required services</h4>
                {(simulation.required_services ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">None identified.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {simulation.required_services!.map((service) => (
                      <span key={service} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-300">{service}</span>
                    ))}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><Boxes className="h-3.5 w-3.5" /> Affected surfaces</h4>
                <p className="mt-2 text-[11px] text-slate-400">Repos: {(simulation.affected_repos ?? []).join(', ') || 'none'}</p>
                <p className="mt-1 text-[11px] text-slate-400">Buckets: {(simulation.affected_buckets ?? []).join(', ') || 'none'}</p>
              </article>

              {simulation.estimated_cost && (
                <article className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><Database className="h-3.5 w-3.5" /> Estimated cost</h4>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-[#061126] p-2 font-mono text-[11px] text-slate-400">
                    {JSON.stringify(simulation.estimated_cost, null, 2)}
                  </pre>
                </article>
              )}

              {simulation.risk_summary && (
                <article className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><ShieldCheck className="h-3.5 w-3.5" /> Risk summary</h4>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-[#061126] p-2 font-mono text-[11px] text-slate-400">
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
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><RotateCcw className="h-3.5 w-3.5" /> Rollback notes</p>
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

        <section className="mt-8">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <History className="h-4 w-4" /> Saved preview history
          </h3>
          {historyLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading history</div>
          ) : history.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon={<History className="h-5 w-5" />} title="No saved previews yet." body="Run a simulation above and save it to build history." />
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
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <StatusBadge status={item.status} compact />
                    {item.repo && <span>{item.repo}</span>}
                    {item.created_at && <span>{formatDate(item.created_at)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedPreview && (
            <pre className="mt-3 max-h-96 overflow-auto rounded-xl border border-white/8 bg-[#061126] p-3 font-mono text-[11px] leading-5 text-slate-300">
              {JSON.stringify(selectedPreview, null, 2)}
            </pre>
          )}
        </section>

        <section className="mt-8">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Policy profiles</h3>
          {profilesLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading profiles</div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(profiles).map(([key, profile]) => (
                <article key={key} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <p className="text-xs font-semibold text-slate-100">{profile.label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{profile.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
                    {profile.allows_repo_mutation && <span className="rounded-full border border-white/10 px-1.5 py-0.5">repo mutation</span>}
                    {profile.allows_r2_write && <span className="rounded-full border border-white/10 px-1.5 py-0.5">R2 write</span>}
                    {profile.requires_human_approval && <span className="rounded-full border border-amber-300/20 px-1.5 py-0.5 text-amber-200">approval required</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
