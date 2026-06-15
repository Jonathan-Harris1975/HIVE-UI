import { useState, useCallback, useEffect } from 'react'
import { skills as skillsApi } from '@/api/hive'
import type { SkillSearchResult, SkillRecommendation, SkillRepo, SkillRisk } from '@/types'
import { priorityColour, riskColour, statusColour, truncate, cx } from '@/utils'
import { Spinner, EmptyState, ErrorBanner, Badge } from '@/components/shared'

const REPOS: SkillRepo[] = ['AIMS', 'RAMS', 'HIVE', 'WEBSITE', 'MAST']
const RISKS: SkillRisk[] = ['low', 'medium', 'high']

export function SkillsView() {
  const [tab, setTab]             = useState<'search' | 'recommend'>('search')
  const [query, setQuery]         = useState('')
  const [repoFilter, setRepoFilter] = useState<SkillRepo | ''>('')
  const [riskFilter, setRiskFilter] = useState<SkillRisk | ''>('')
  const [results, setResults]     = useState<SkillSearchResult[]>([])
  const [recommendations, setRecs] = useState<SkillRecommendation[]>([])
  const [recQuery, setRecQuery]   = useState('')
  const [recRepo, setRecRepo]     = useState<SkillRepo | ''>('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [searched, setSearched]   = useState(false)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  // Initial load — list all
  useEffect(() => {
    handleSearch('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { limit: 100 }
      if (q) params.q = q
      if (repoFilter) params.repo = repoFilter
      if (riskFilter) params.risk = riskFilter

      const res = await skillsApi.search(params as Parameters<typeof skillsApi.search>[0])
      setResults(res.results ?? [])
      setTotalCount(res.total ?? 0)
      setSearched(true)
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [repoFilter, riskFilter])

  const handleRecommend = useCallback(async () => {
    if (!recQuery.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await skillsApi.recommend({
        query: recQuery,
        repo: recRepo || undefined,
        max_results: 8,
      })
      setRecs(res.recommendations ?? [])
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Recommendation failed')
    } finally {
      setLoading(false)
    }
  }, [recQuery, recRepo])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-hive-border shrink-0">
        <h1 className="text-sm font-semibold text-hive-text">Skills</h1>
        <div className="flex gap-1 bg-hive-surfaceHi rounded-hive p-1">
          {(['search', 'recommend'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                'text-xs px-3 py-1 rounded transition-colors capitalize',
                tab === t
                  ? 'bg-hive-surface text-hive-text border border-hive-border'
                  : 'text-hive-textDim hover:text-hive-textSoft',
              )}
            >
              {t === 'search' ? '⟡ Search' : '✦ Recommend'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'search' ? (
        <SearchPanel
          query={query}
          setQuery={setQuery}
          repoFilter={repoFilter}
          setRepoFilter={setRepoFilter}
          riskFilter={riskFilter}
          setRiskFilter={setRiskFilter}
          results={results}
          totalCount={totalCount}
          loading={loading}
          error={error}
          searched={searched}
          expanded={expanded}
          setExpanded={setExpanded}
          onSearch={handleSearch}
          setError={setError}
        />
      ) : (
        <RecommendPanel
          query={recQuery}
          setQuery={setRecQuery}
          repo={recRepo}
          setRepo={setRecRepo}
          results={recommendations}
          loading={loading}
          error={error}
          setError={setError}
          onRecommend={handleRecommend}
        />
      )}
    </div>
  )
}

// ── Search panel ───────────────────────────────────────────────────────────
interface SearchPanelProps {
  query: string
  setQuery: (q: string) => void
  repoFilter: SkillRepo | ''
  setRepoFilter: (r: SkillRepo | '') => void
  riskFilter: SkillRisk | ''
  setRiskFilter: (r: SkillRisk | '') => void
  results: SkillSearchResult[]
  totalCount: number
  loading: boolean
  error: string | null
  searched: boolean
  expanded: string | null
  setExpanded: (id: string | null) => void
  onSearch: (q: string) => void
  setError: (e: string | null) => void
}

function SearchPanel({
  query, setQuery, repoFilter, setRepoFilter,
  riskFilter, setRiskFilter, results, totalCount,
  loading, error, searched, expanded, setExpanded,
  onSearch, setError,
}: SearchPanelProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch(query)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search bar + filters */}
      <div className="px-5 py-3 border-b border-hive-border shrink-0 space-y-2">
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Search skills by name, tag, lane, repo…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="hive-input flex-1 text-sm"
          />
          <button
            onClick={() => onSearch(query)}
            disabled={loading}
            className="hive-btn-primary px-4"
          >
            {loading ? <Spinner size="sm" /> : 'Search'}
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xs text-hive-textDim">Filter:</span>

          {/* Repo filter */}
          {REPOS.map(r => (
            <button
              key={r}
              onClick={() => { setRepoFilter(repoFilter === r ? '' : r); onSearch(query) }}
              className={cx(
                'hive-badge border transition-colors cursor-pointer',
                repoFilter === r
                  ? 'border-hive-accent text-hive-accent bg-hive-accentSoft'
                  : 'border-hive-border text-hive-textDim hover:border-hive-accent/50',
              )}
            >
              {r}
            </button>
          ))}

          <span className="text-hive-border">|</span>

          {/* Risk filter */}
          {RISKS.map(r => (
            <button
              key={r}
              onClick={() => { setRiskFilter(riskFilter === r ? '' : r); onSearch(query) }}
              className={cx(
                'hive-badge border transition-colors cursor-pointer capitalize',
                riskFilter === r
                  ? riskColour(r)
                  : 'border-hive-border text-hive-textDim hover:border-hive-accent/50',
              )}
            >
              {r}
            </button>
          ))}

          {(repoFilter || riskFilter) && (
            <button
              onClick={() => { setRepoFilter(''); setRiskFilter(''); onSearch(query) }}
              className="text-2xs text-hive-textDim hover:text-hive-error transition-colors"
            >
              × clear
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {loading && results.length === 0 ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : searched && results.length === 0 ? (
          <EmptyState icon="⟡" title="No skills found" description="Try a different search term or clear filters" />
        ) : (
          <>
            {searched && (
              <p className="hive-section-title mb-3">
                {totalCount} skill{totalCount !== 1 ? 's' : ''}
                {query && ` matching "${query}"`}
              </p>
            )}
            <div className="space-y-2">
              {results.map(skill => (
                <SkillCard
                  key={skill.skill_id}
                  skill={skill}
                  expanded={expanded === skill.skill_id}
                  onToggle={() => setExpanded(expanded === skill.skill_id ? null : skill.skill_id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Recommend panel ────────────────────────────────────────────────────────
interface RecommendPanelProps {
  query: string
  setQuery: (q: string) => void
  repo: SkillRepo | ''
  setRepo: (r: SkillRepo | '') => void
  results: SkillRecommendation[]
  loading: boolean
  error: string | null
  setError: (e: string | null) => void
  onRecommend: () => void
}

function RecommendPanel({
  query, setQuery, repo, setRepo,
  results, loading, error, setError, onRecommend,
}: RecommendPanelProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Input */}
      <div className="px-5 py-4 border-b border-hive-border shrink-0 space-y-3">
        <div>
          <label className="hive-section-title block mb-1.5">Describe your task</label>
          <textarea
            rows={3}
            placeholder="e.g. I need to review this week's podcast script for brand voice issues"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="hive-input text-sm resize-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="hive-section-title block mb-1.5">Repo context (optional)</label>
            <select
              value={repo}
              onChange={e => setRepo(e.target.value as SkillRepo | '')}
              className="hive-input text-sm"
            >
              <option value="">Any repo</option>
              {REPOS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="pt-5">
            <button
              onClick={onRecommend}
              disabled={!query.trim() || loading}
              className="hive-btn-primary px-5 py-2 disabled:opacity-50"
            >
              {loading ? <Spinner size="sm" /> : '✦ Recommend'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : results.length === 0 ? (
          <EmptyState
            icon="✦"
            title="Describe your task above"
            description="HIVE will recommend the most relevant skills"
          />
        ) : (
          <div className="space-y-3">
            <p className="hive-section-title">{results.length} recommendation{results.length !== 1 ? 's' : ''}</p>
            {results.map((rec, i) => (
              <RecommendCard key={rec.skill_id} rec={rec} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Skill card (search result) ─────────────────────────────────────────────
interface SkillCardProps {
  skill: SkillSearchResult
  expanded: boolean
  onToggle: () => void
}

function SkillCard({ skill, expanded, onToggle }: SkillCardProps) {
  const topRepo = skill.repos[0]
  const topStatus = topRepo ? (skill.repo_status[topRepo] ?? 'candidate') : 'candidate'

  return (
    <div
      className={cx(
        'hive-card cursor-pointer transition-all',
        expanded ? 'border-hive-accent/40' : 'hover:border-hive-accent/25',
      )}
      onClick={onToggle}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        {/* Priority badge */}
        <span className={cx('hive-badge border shrink-0 mt-0.5', priorityColour(skill.priority_tier))}>
          {skill.priority_tier.split(' ')[0]}
        </span>

        {/* Name + ID */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-hive-text truncate">{skill.slug}</span>
            <span className="text-2xs text-hive-textDim font-mono shrink-0">{skill.skill_id}</span>
          </div>
          <p className="text-2xs text-hive-textDim mt-0.5">{skill.hive_lane}</p>
        </div>

        {/* Right badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cx('hive-badge', riskColour(skill.risk_level))}>{skill.risk_level}</span>
          <span className={cx('hive-badge', statusColour(topStatus))}>{topStatus}</span>
          <span className="text-hive-textDim text-xs">{expanded ? '▴' : '▾'}</span>
        </div>
      </div>

      {/* Repo chips */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {skill.repos.map(r => (
          <span key={r} className="hive-badge border border-hive-border text-hive-textDim bg-hive-surfaceHi">
            {r}
          </span>
        ))}
        {skill.tags?.slice(0, 4).map(t => (
          <span key={t} className="hive-badge text-hive-textDim">{t}</span>
        ))}
        {skill.search_score !== undefined && (
          <span className="ml-auto text-2xs text-hive-textDim font-mono">
            score {skill.search_score}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-hive-border space-y-2 animate-fade-in">
          {skill.description?.why_useful && (
            <div>
              <p className="hive-section-title mb-1">Why useful</p>
              <p className="text-xs text-hive-textSoft leading-relaxed">{skill.description.why_useful}</p>
            </div>
          )}
          {skill.description?.primary_use_case && (
            <div>
              <p className="hive-section-title mb-1">Use case</p>
              <p className="text-xs text-hive-textSoft leading-relaxed">{skill.description.primary_use_case}</p>
            </div>
          )}
          {skill.description?.evidence_note && (
            <div>
              <p className="hive-section-title mb-1">Evidence</p>
              <p className="text-xs text-hive-textDim leading-relaxed">{skill.description.evidence_note}</p>
            </div>
          )}
          {skill.matched_terms && skill.matched_terms.length > 0 && (
            <div>
              <p className="hive-section-title mb-1">Matched</p>
              <div className="flex flex-wrap gap-1">
                {skill.matched_terms.map(t => (
                  <Badge key={t} variant="accent">{t}</Badge>
                ))}
              </div>
            </div>
          )}
          {/* Repo status breakdown */}
          <div>
            <p className="hive-section-title mb-1">Repo status</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(skill.repo_status).map(([repo, status]) => (
                <span key={repo} className={cx('hive-badge border border-hive-border', statusColour(status))}>
                  {repo}: {status}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Recommend card ─────────────────────────────────────────────────────────
function RecommendCard({ rec, rank }: { rec: SkillRecommendation; rank: number }) {
  return (
    <div className="hive-card">
      <div className="flex items-start gap-3">
        {/* Rank */}
        <div className="w-6 h-6 rounded-full bg-hive-accentSoft border border-hive-accent/30 flex items-center justify-center text-2xs font-bold text-hive-accent shrink-0 mt-0.5">
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-hive-text">{rec.slug}</span>
            <span className="text-2xs font-mono text-hive-textDim">{rec.skill_id}</span>
            <span className={cx('hive-badge border', priorityColour(rec.priority_tier))}>
              {rec.priority_tier.split(' ')[0]}
            </span>
            <span className={cx('hive-badge', riskColour(rec.risk_level))}>
              {rec.risk_level}
            </span>
            {rec.ready_to_use && <Badge variant="success">ready</Badge>}
            {rec.confirmation_required && <Badge variant="warning">needs confirm</Badge>}
          </div>

          {rec.recommendation_reason && (
            <p className="text-xs text-hive-textSoft mt-1.5 leading-relaxed">
              {rec.recommendation_reason}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2">
            <span className="text-2xs text-hive-textDim">
              via {rec.relevance_source}
            </span>
            <div className="flex-1 bg-hive-surfaceHi rounded-full h-1 overflow-hidden">
              <div
                className="bg-hive-accent h-full rounded-full transition-all"
                style={{ width: `${Math.round(rec.relevance_score * 100)}%` }}
              />
            </div>
            <span className="text-2xs text-hive-textDim font-mono">
              {Math.round(rec.relevance_score * 100)}%
            </span>
          </div>

          {/* Repo status */}
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(rec.repo_status).map(([repo, status]) => (
              <span key={repo} className={cx('hive-badge border border-hive-border', statusColour(status as string))}>
                {repo}: {status}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
