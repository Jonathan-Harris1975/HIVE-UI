import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Database,
  GitBranch,
  HardDrive,
  LoaderCircle,
  Network,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import type { HealthResponse } from '../types/api'

interface FlagProps {
  label: string
  active: boolean
  detail: string
  icon: typeof Activity
}

function Flag({ label, active, detail, icon: Icon }: FlagProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${active ? 'border-emerald-300/15 bg-emerald-300/7 text-emerald-200' : 'border-amber-300/15 bg-amber-300/7 text-amber-200'}`}><Icon className="h-5 w-5" /></div>
        {active ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <CircleAlert className="h-4 w-4 text-amber-300" />}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-white">{label}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  )
}

export function OpsPage() {
  const { health: authHealth, refreshHealth } = useAuth()
  const { setPayload, setOpen } = useInspector()
  const [health, setHealth] = useState<HealthResponse | null>(authHealth)
  const [hygiene, setHygiene] = useState<unknown>(null)
  const [templates, setTemplates] = useState<unknown>(null)
  const [reviews, setReviews] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOps = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [healthResult, hygieneResult, templateResult, reviewResult] = await Promise.all([
        apiFetch<HealthResponse>('/health'),
        apiFetch('/v1/system/repo-hygiene?include_hashes=false&max_files=5000'),
        apiFetch('/v1/workflow-graphs/templates'),
        apiFetch('/v1/execution-reviews?limit=20'),
      ])
      setHealth(healthResult)
      setHygiene(hygieneResult)
      setTemplates(templateResult)
      setReviews(reviewResult)
      await refreshHealth()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Operations data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [refreshHealth])

  useEffect(() => {
    void loadOps()
  }, [loadOps])

  const flags: FlagProps[] = [
    { label: 'OpenRouter', active: Boolean(health?.openrouter_configured), detail: 'Model gateway and routing policy', icon: Network },
    { label: 'SQL persistence', active: Boolean(health?.database_configured), detail: health?.database_dialect ? `${health.database_dialect} conversation store` : 'Conversation database is not configured', icon: Database },
    { label: 'R2 storage', active: Boolean(health?.r2_configured), detail: 'Uploads and ecosystem artefacts', icon: HardDrive },
    { label: 'Vector retrieval', active: Boolean(health?.vectorize_configured), detail: 'Semantic file and chunk retrieval', icon: GitBranch },
    { label: 'Embeddings', active: Boolean(health?.embeddings_configured), detail: 'Vector generation provider', icon: Activity },
    { label: 'D1 metadata', active: Boolean(health?.d1_configured), detail: 'Skills and ecosystem indexes', icon: ShieldCheck },
  ]

  function inspect(title: string, value: unknown) {
    setPayload({ eyebrow: 'Operations', title, description: 'Read-only operational data from the HIVE backend.', json: value })
    setOpen(true)
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="flex flex-col gap-5 rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Control plane</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Operational health at a glance</h2>
            <p className="mt-2 text-sm text-slate-500">Build {health?.build ?? 'unknown'} · {health?.env ?? 'environment unknown'}</p>
          </div>
          <button type="button" onClick={() => void loadOps()} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs text-slate-300 hover:bg-white/[0.07]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh status
          </button>
        </section>

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}

        {loading && !health ? (
          <div className="flex items-center justify-center py-20 text-slate-500"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading operational state</div>
        ) : (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {flags.map((flag) => <Flag key={flag.label} {...flag} />)}
            </section>

            <section className="mt-5 grid gap-3 lg:grid-cols-3">
              <button type="button" onClick={() => inspect('Repository hygiene', hygiene)} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-5 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                <GitBranch className="h-5 w-5 text-cyan-300" />
                <h3 className="mt-4 text-sm font-semibold text-white">Repository hygiene</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">Duplicate and orphan candidates, exposed as a read-only report.</p>
                <span className="mt-4 inline-block text-xs text-cyan-300/70">Open inspector →</span>
              </button>
              <button type="button" onClick={() => inspect('Workflow graph templates', templates)} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-5 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                <Network className="h-5 w-5 text-emerald-300" />
                <h3 className="mt-4 text-sm font-semibold text-white">Workflow graphs</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">Available graph templates for controlled execution previews.</p>
                <span className="mt-4 inline-block text-xs text-emerald-300/70">Open inspector →</span>
              </button>
              <button type="button" onClick={() => inspect('Execution review queue', reviews)} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-5 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                <ShieldCheck className="h-5 w-5 text-violet-300" />
                <h3 className="mt-4 text-sm font-semibold text-white">Review queue</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">Plans awaiting review, decisions and evidence-pack checks.</p>
                <span className="mt-4 inline-block text-xs text-violet-300/70">Open inspector →</span>
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
