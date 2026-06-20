import {
  AlertTriangle,
  BrainCircuit,
  Filter,
  LoaderCircle,
  MessageSquareText,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { StatusBadge } from '../components/StatusBadge'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import type { SkillCleanupResponse, SkillItem, SkillListResponse } from '../types/api'

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

function skillTitle(skill: SkillItem, index = 0): string {
  const metadata = meta(skill)
  return String(skill.title || skill.name || metadata.title || `Skill ${index + 1}`)
}

export function SkillsPage() {
  const navigate = useNavigate()
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
  const [cleanupPreview, setCleanupPreview] = useState<SkillCleanupResponse | null>(null)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ limit: submittedQuery.trim() ? '100' : '300' })
    if (repo) params.set('repo', repo)
    if (risk) params.set('risk_level', risk)
    if (lane) params.set('hive_lane', lane)
    try {
      const response = submittedQuery.trim()
        ? await apiFetch<SkillListResponse>(`/v1/skills/search?q=${encodeURIComponent(submittedQuery.trim())}&${params}`)
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
    const repos = new Set<string>(['HIVE', 'AIMS', 'RAMS', 'Website'])
    const risks = new Set<string>(['low', 'medium', 'high'])
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
      if (response.ok === false) throw new Error(response.error || 'Recommendations failed.')
      setSkills(itemsFrom(response))
      setSubmittedQuery('')
      setShowRecommender(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Recommendations failed.')
    } finally {
      setRecommending(false)
    }
  }

  async function previewUploadedFileSkillCleanup() {
    setCleanupRunning(true)
    setCleanupNotice(null)
    setError(null)
    try {
      const response = await apiFetch<SkillCleanupResponse>('/v1/skills/cleanup-uploaded-file-skills', {
        method: 'POST',
        body: JSON.stringify({ dry_run: true, limit: 1000 }),
      })
      if (response.ok === false) throw new Error(response.message || response.error || 'Cleanup preview failed.')
      setCleanupPreview(response)
      const count = response.candidate_count ?? 0
      setCleanupNotice(count > 0 ? `${count} legacy file-created skill record(s) found in D1.` : 'No legacy file-created skill records found.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Cleanup preview failed.')
    } finally {
      setCleanupRunning(false)
    }
  }

  async function runUploadedFileSkillCleanup() {
    if (!cleanupPreview || !cleanupPreview.candidate_count) return
    setCleanupRunning(true)
    setCleanupNotice(null)
    setError(null)
    try {
      const response = await apiFetch<SkillCleanupResponse>('/v1/skills/cleanup-uploaded-file-skills', {
        method: 'POST',
        body: JSON.stringify({
          dry_run: false,
          limit: 1000,
          confirm: 'delete-uploaded-file-skills',
        }),
      })
      if (response.ok === false) throw new Error(response.message || response.error || 'Cleanup failed.')
      setCleanupPreview(response)
      setCleanupNotice(response.message || `Deleted ${response.deleted_count ?? 0} legacy file-created skill record(s).`)
      await loadSkills()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Cleanup failed.')
    } finally {
      setCleanupRunning(false)
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
        { label: 'Status', value: field(skill, 'status', 'Indexed') },
        { label: 'Score', value: skill.score == null ? 'Not scored' : String(skill.score) },
      ],
      json: skill,
    })
    setOpen(true)
  }

  function insertIntoChat(skill: SkillItem, index: number) {
    const title = skillTitle(skill, index)
    const skillId = String(skill.id || meta(skill).skill_id || title)
    const draft = `Use the shared skill ${title} (${skillId}) as a planning reference for this task: `
    navigate(`/chat?draft=${encodeURIComponent(draft)}`)
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Shared skill pool</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Find the right operational capability</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Search and recommendation are metadata-only and review-gated. Nothing is installed or executed from this screen.</p>
            </div>
            <button type="button" onClick={() => setShowRecommender((value) => !value)} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035]">
              <WandSparkles className="h-4 w-4" /> Recommend for task
            </button>
          </div>

          {showRecommender && (
            <form onSubmit={recommend} className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
              <label className="text-xs font-medium text-slate-300">Describe the task</label>
              <textarea value={task} onChange={(event) => setTask(event.target.value)} rows={3} placeholder="For example: review a Koyeb deployment bundle and produce a safe patch plan" className="mt-2 w-full resize-none rounded-xl border border-white/8 bg-[#071426] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-cyan-300/30" />
              <div className="mt-3 flex justify-end">
                <button type="submit" disabled={!task.trim() || recommending} className="flex h-9 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-medium text-cyan-100 disabled:opacity-50">
                  {recommending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate recommendations
                </button>
              </div>
            </form>
          )}

          <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/80"><AlertTriangle className="h-4 w-4" /> Catalogue cleanup</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">Find legacy duplicate skills created from ordinary uploaded files. Cleanup deletes D1 catalogue rows only; no R2 bucket object is touched.</p>
              </div>
              <div className="flex flex-col gap-2 sm:min-w-[190px]">
                <button type="button" onClick={previewUploadedFileSkillCleanup} disabled={cleanupRunning} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 text-xs font-medium text-amber-100 disabled:opacity-50">
                  {cleanupRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Preview cleanup
                </button>
                <button type="button" onClick={runUploadedFileSkillCleanup} disabled={cleanupRunning || !cleanupPreview?.candidate_count} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 text-xs font-medium text-rose-100 disabled:opacity-45">
                  <Trash2 className="h-4 w-4" /> Delete previewed rows
                </button>
              </div>
            </div>
            {cleanupPreview && (
              <div className="mt-4 rounded-xl border border-white/8 bg-[#071426]/70 p-3 text-xs text-slate-300">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 px-2 py-1">Checked {cleanupPreview.checked_count ?? 0}</span>
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2 py-1 text-amber-100">Candidates {cleanupPreview.candidate_count ?? 0}</span>
                  <span className="rounded-full border border-cyan-300/15 bg-cyan-300/7 px-2 py-1 text-cyan-100">R2 deletes {cleanupPreview.r2_deletes_attempted ?? 0}</span>
                  {cleanupPreview.deleted_count != null && <span className="rounded-full border border-emerald-300/15 bg-emerald-300/7 px-2 py-1 text-emerald-100">Deleted {cleanupPreview.deleted_count}</span>}
                </div>
                {!!cleanupPreview.candidates?.length && (
                  <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
                    {cleanupPreview.candidates.slice(0, 8).map((candidate) => (
                      <div key={candidate.id || candidate.title} className="rounded-lg border border-white/6 bg-white/[0.025] px-3 py-2">
                        <p className="font-medium text-slate-100">{candidate.title || candidate.id}</p>
                        <p className="mt-1 break-all text-[11px] text-slate-400">{candidate.object_key || 'No object key'} · {(candidate.reasons || []).join(', ')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={searchSkills} className="mt-6 grid gap-2 border-t border-white/8 pt-5 md:grid-cols-[minmax(220px,1fr)_160px_160px_180px_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-400 focus:border-cyan-300/30" />
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
        {cleanupNotice && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">{cleanupNotice}</div>}

        <section className="mt-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading skill registry</div>
          ) : skills.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 py-16 text-center text-slate-400"><BrainCircuit className="mx-auto h-9 w-9" /><p className="mt-3 text-sm">No skills match the current query.</p></div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {skills.map((skill, index) => {
                const metadata = meta(skill)
                const title = skillTitle(skill, index)
                const riskLevel = field(skill, 'risk_level', 'unknown')
                const status = field(skill, 'status', 'indexed')
                const score = skill.score == null ? null : Number(skill.score)
                return (
                  <article key={String(skill.id || metadata.skill_id || `${title}-${index}`)} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4 transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                    <button type="button" onClick={() => inspect(skill)} className="block w-full text-left">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/7 text-cyan-200"><BrainCircuit className="h-4.5 w-4.5" /></div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {score != null && Number.isFinite(score) && <span className="rounded-full border border-cyan-300/15 bg-cyan-300/7 px-2 py-1 text-[10px] text-cyan-200">{score.toFixed(2)}</span>}
                          <StatusBadge status={riskLevel} compact />
                          <StatusBadge status={status} compact />
                        </div>
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
                      <p className="mt-2 line-clamp-3 min-h-[60px] text-xs leading-5 text-slate-400">{String(skill.description || metadata.description || 'No description supplied.')}</p>
                      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/6 pt-3 text-[10px] text-slate-400">
                        <span>{field(skill, 'repo', 'Shared')}</span><span>·</span><span>{field(skill, 'hive_lane', field(skill, 'lane', 'General'))}</span>
                      </div>
                    </button>
                    <button type="button" onClick={() => insertIntoChat(skill, index)} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/6 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/10">
                      <MessageSquareText className="h-4 w-4" /> Use in chat
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
