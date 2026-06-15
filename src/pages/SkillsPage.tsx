import {
  BrainCircuit,
  Filter,
  LoaderCircle,
  Search,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import type { SkillItem, SkillListResponse } from '../types/api'

function itemsFrom(response: SkillListResponse): SkillItem[] {
  return response.items ?? response.skills ?? response.results ?? []
}

function meta(item: SkillItem): Record<string, unknown> {
  return typeof item.metadata === 'object' && item.metadata ? item.metadata as Record<string, unknown> : {}
}

function field(item: SkillItem, key: string, fallback = ''): string {
  const value = item[key] ?? meta(item)[key]
  return value == null ? fallback : String(value)
}

export function SkillsPage() {
  const { setPayload, setOpen } = useInspector()
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [repo, setRepo] = useState('')
  const [risk, setRisk] = useState('')
  const [lane, setLane] = useState('')
  const [task, setTask] = useState('')
  const [recommending, setRecommending] = useState(false)
  const [showRecommender, setShowRecommender] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ limit: '300' })
    if (repo) params.set('repo', repo)
    if (risk) params.set('risk_level', risk)
    if (lane) params.set('hive_lane', lane)
    try {
      const response = submittedQuery.trim()
        ? await apiFetch<SkillListResponse>(`/v1/skills/search?q=${encodeURIComponent(submittedQuery.trim())}&limit=100&${params}`)
        : await apiFetch<SkillListResponse>(`/v1/skills/list?${params}`)
      if (response.ok === false) throw new Error(response.error || 'Skill registry query failed.')
      setSkills(itemsFrom(response))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Skills could not be loaded.')
      setSkills([])
    } finally {
      setLoading(false)
    }
  }, [lane, repo, risk, submittedQuery])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const filters = useMemo(() => {
    const repos = new Set<string>()
    const risks = new Set<string>()
    const lanes = new Set<string>()
    for (const skill of skills) {
      const skillRepo = field(skill, 'repo')
      const skillRisk = field(skill, 'risk_level')
      const skillLane = field(skill, 'hive_lane') || field(skill, 'lane')
      if (skillRepo) repos.add(skillRepo)
      if (skillRisk) risks.add(skillRisk)
      if (skillLane) lanes.add(skillLane)
    }
    return { repos: [...repos].sort(), risks: [...risks].sort(), lanes: [...lanes].sort() }
  }, [skills])

  function searchSkills(event: FormEvent) {
    event.preventDefault()
    setSubmittedQuery(query.trim())
  }

  async function recommend(event: FormEvent) {
    event.preventDefault()
    if (!task.trim()) return
    setRecommending(true)
    setError(null)
    try {
      const response = await apiFetch<SkillListResponse>('/v1/skills/recommend', {
        method: 'POST',
        body: JSON.stringify({
          task: task.trim(),
          repo: repo || null,
          hive_lane: lane || null,
          risk_ceiling: risk || null,
          limit: 12,
        }),
      })
      setSkills(itemsFrom(response))
      setShowRecommender(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Recommendations failed.')
    } finally {
      setRecommending(false)
    }
  }

  function inspect(skill: SkillItem) {
    const metadata = meta(skill)
    setPayload({
      eyebrow: 'Skill registry',
      title: String(skill.title || skill.name || metadata.title || 'Skill'),
      description: String(skill.description || metadata.description || 'Shared ecosystem skill metadata.'),
      rows: [
        { label: 'Repository', value: field(skill, 'repo', 'Unspecified') },
        { label: 'Lane', value: field(skill, 'hive_lane', field(skill, 'lane', 'Unspecified')) },
        { label: 'Risk', value: field(skill, 'risk_level', 'Unspecified') },
        { label: 'Priority', value: field(skill, 'priority_tier', 'Unspecified') },
        { label: 'Score', value: skill.score == null ? 'Not scored' : String(skill.score) },
      ],
      json: skill,
    })
    setOpen(true)
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Shared skill pool</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Find the right operational capability</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Search is metadata-only and review-gated. Nothing is installed or executed from this screen.</p>
            </div>
            <button type="button" onClick={() => setShowRecommender((value) => !value)} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035]">
              <WandSparkles className="h-4 w-4" /> Recommend for task
            </button>
          </div>

          {showRecommender && (
            <form onSubmit={recommend} className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
              <label className="text-xs font-medium text-slate-300">Describe the task</label>
              <textarea value={task} onChange={(event) => setTask(event.target.value)} rows={3} placeholder="For example: review a Koyeb deployment bundle and produce a safe patch plan" className="mt-2 w-full resize-none rounded-xl border border-white/8 bg-[#071426] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/30" />
              <div className="mt-3 flex justify-end">
                <button type="submit" disabled={!task.trim() || recommending} className="flex h-9 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-medium text-cyan-100 disabled:opacity-50">
                  {recommending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate recommendations
                </button>
              </div>
            </form>
          )}

          <form onSubmit={searchSkills} className="mt-6 grid gap-2 border-t border-white/8 pt-5 md:grid-cols-[minmax(220px,1fr)_160px_160px_180px_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/30" />
            </label>
            <select value={repo} onChange={(event) => setRepo(event.target.value)} className="h-10 rounded-xl border border-white/8 bg-[#071426] px-3 text-xs text-slate-300 outline-none">
              <option value="">All repos</option>
              {filters.repos.map((value) => <option key={value}>{value}</option>)}
            </select>
            <select value={risk} onChange={(event) => setRisk(event.target.value)} className="h-10 rounded-xl border border-white/8 bg-[#071426] px-3 text-xs text-slate-300 outline-none">
              <option value="">All risk levels</option>
              {filters.risks.map((value) => <option key={value}>{value}</option>)}
            </select>
            <select value={lane} onChange={(event) => setLane(event.target.value)} className="h-10 rounded-xl border border-white/8 bg-[#071426] px-3 text-xs text-slate-300 outline-none">
              <option value="">All lanes</option>
              {filters.lanes.map((value) => <option key={value}>{value}</option>)}
            </select>
            <button type="submit" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs text-slate-300 hover:bg-white/[0.07]"><Filter className="h-4 w-4" /> Apply</button>
          </form>
        </section>

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <section className="mt-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading skill registry</div>
          ) : skills.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 py-16 text-center text-slate-600"><BrainCircuit className="mx-auto h-9 w-9" /><p className="mt-3 text-sm">No skills match the current query.</p></div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {skills.map((skill, index) => {
                const metadata = meta(skill)
                const title = String(skill.title || skill.name || metadata.title || `Skill ${index + 1}`)
                const riskLevel = field(skill, 'risk_level', 'unknown')
                const score = skill.score == null ? null : Number(skill.score)
                return (
                  <button key={String(skill.id || metadata.skill_id || `${title}-${index}`)} type="button" onClick={() => inspect(skill)} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/7 text-cyan-200"><BrainCircuit className="h-4.5 w-4.5" /></div>
                      <div className="flex gap-1.5">
                        {score != null && <span className="rounded-full border border-cyan-300/15 bg-cyan-300/7 px-2 py-1 text-[10px] text-cyan-200">{score.toFixed(2)}</span>}
                        <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-slate-500">{riskLevel}</span>
                      </div>
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
                    <p className="mt-2 line-clamp-3 min-h-[60px] text-xs leading-5 text-slate-500">{String(skill.description || metadata.description || 'No description supplied.')}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/6 pt-3 text-[10px] text-slate-600">
                      <span>{field(skill, 'repo', 'Shared')}</span><span>·</span><span>{field(skill, 'hive_lane', field(skill, 'lane', 'General'))}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
