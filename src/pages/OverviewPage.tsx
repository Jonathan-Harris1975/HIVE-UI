import { Activity, Bot, Files, FolderGit2, RefreshCcw, Workflow } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { formatDate } from '../lib/format'
import { healthyServiceCount, healthEvidenceFresh, serviceAttentionRank } from '../lib/repositories'
import type { HealthResponse, OpsEventsResponse, RepoHealthResponse } from '../types/api'

const destinations = [
  { to: '/ops', title: 'Operations', description: 'Runtime health, alerts and lifecycle evidence', icon: Activity },
  { to: '/repositories', title: 'Repositories', description: 'Governed snapshots, service health and scheduled work', icon: FolderGit2 },
  { to: '/execution', title: 'Execution', description: 'Prepare controlled plans and review decisions', icon: Workflow },
  { to: '/chat', title: 'Chat', description: 'Ask HIVE, investigate evidence and continue conversations', icon: Bot },
  { to: '/files', title: 'Files', description: 'Browse and work with authenticated storage', icon: Files },
  { to: '/llm-spend', title: 'LLM spend', description: 'Dated provider charges and attribution evidence', icon: Activity },
]

type Snapshot = { health: HealthResponse | null; repositories: RepoHealthResponse | null; alerts: OpsEventsResponse | null; fetchedAt: string | null }

export function OverviewPage() {
  const { health: lastHealth } = useAuth()
  const [snapshot, setSnapshot] = useState<Snapshot>({ health: null, repositories: null, alerts: null, fetchedAt: null })
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now)
  const controller = useRef<AbortController | null>(null)
  const lastAttempt = useRef(0)
  const [refreshSeconds, setRefreshSeconds] = useState(() => {
    try { const value = localStorage.getItem('hive-overview-refresh'); return value === '0' || value === '120' ? Number(value) : 60 } catch { return 60 }
  })

  const refresh = useCallback(async () => {
    if (controller.current && !controller.current.signal.aborted) return
    lastAttempt.current = Date.now()
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)])
    const [health, repositories, alerts] = await Promise.allSettled([
      apiFetch<HealthResponse>('/health', { signal }),
      apiFetch<RepoHealthResponse>('/v1/system/repo-health?force_refresh=false', { signal }),
      apiFetch<OpsEventsResponse>('/v1/system/ops-events?limit=6', { signal }),
    ])
    if (request.signal.aborted) return
    controller.current = null
    setNow(Date.now())
    setSnapshot({
      health: health.status === 'fulfilled' ? health.value : null,
      repositories: repositories.status === 'fulfilled' && repositories.value.ok ? repositories.value : null,
      alerts: alerts.status === 'fulfilled' && alerts.value.ok ? alerts.value : null,
      fetchedAt: new Date().toISOString(),
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    return () => controller.current?.abort()
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    try { localStorage.setItem('hive-overview-refresh', String(refreshSeconds)) } catch { /* Preferences are optional. */ }
    if (!refreshSeconds) return
    const check = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - lastAttempt.current >= refreshSeconds * 1000) void refresh()
    }
    const timer = window.setInterval(check, 15_000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('online', check)
    }
  }, [refresh, refreshSeconds])
  const repos = snapshot.repositories?.repos
  const currentHealth = !loading && Boolean(repos?.length) && healthEvidenceFresh(snapshot.repositories?.generated_at, now)
  const orderedRepos = [...(repos || [])].sort((a, b) => serviceAttentionRank(a.status) - serviceAttentionRank(b.status) || a.repo.localeCompare(b.repo))
  const attention = orderedRepos.filter((repo) => serviceAttentionRank(repo.status) < 3)
  const orderedAlerts = [...(snapshot.alerts?.items || [])].sort((a, b) =>
    (Date.parse(b.occurred_at || b.received_at || '') || 0) - (Date.parse(a.occurred_at || a.received_at || '') || 0))
  const alerts = snapshot.alerts?.items
  const critical = alerts?.filter((item) => item.severity === 'critical').length
  const unavailable = !loading && (!snapshot.health || !repos || !alerts)
  const runtimeStatus = loading ? 'Checking' : snapshot.health ? (snapshot.health.ok ? 'Responded' : 'Failed') : 'Unknown'

  return (
    <div className="hive-overview h-full overflow-y-auto" data-testid="command-centre">
      <div className="hive-overview-inner">
        <section className="hive-command-hero" aria-labelledby="command-title">
          <div>
            <p className="hive-kicker">HIVE / Control centre</p>
            <h2 id="command-title">Your ecosystem at a glance</h2>
            <p>Exceptions, evidence and operational activity.</p>
          </div>
          <Link to="/ops" className="hive-primary-action">Open Operations <span aria-hidden="true">→</span></Link>
        </section>

        <div className="hive-section-heading">
          <div><h2>Operational snapshot</h2><p role="status">{loading ? 'Checking sources…' : snapshot.fetchedAt ? 'Fetched ' + formatDate(snapshot.fetchedAt) : 'Not yet fetched'}</p></div>
          <div className="hive-refresh-controls">
            <label className="hive-refresh-option">Auto-refresh <select value={refreshSeconds} onChange={(event) => setRefreshSeconds(Number(event.target.value))}>
              <option value={0}>Off</option><option value={60}>60 seconds</option><option value={120}>2 minutes</option>
            </select></label>
            <button type="button" className="hive-secondary-action" onClick={() => void refresh()} disabled={loading}>
              <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>
        {unavailable && <p role="status" className="hive-snapshot-notice">Some sources are unavailable. Unknown values are not treated as healthy or zero.</p>}
        <div className="hive-metric-grid" aria-busy={loading}>
          <Link to="/ops" className="hive-metric-card">
            <span>Runtime API</span><strong>{runtimeStatus}</strong>
            <small>{snapshot.health?.env ?? (lastHealth?.env ? 'Last known: ' + lastHealth.env : 'Environment not reported')}</small>
          </Link>
          <Link to="/repositories" className="hive-metric-card">
            <span>Reported services</span><strong>{loading ? 'Checking' : repos?.length ?? 'Unknown'}</strong>
            <small>Repository health probe results</small>
          </Link>
          <Link to="/repositories" className="hive-metric-card">
            <span>{currentHealth ? 'Healthy services' : 'Last reported healthy'}</span><strong>
              {loading ? 'Checking' : repos ? healthyServiceCount(repos) + '/' + repos.length : 'Unknown'}
            </strong>
            <small>{currentHealth ? 'Healthy only; standby is separate' : 'Not current health evidence'}</small>
          </Link>
          <Link to="/ops" className="hive-metric-card">
            <span>Recent critical alerts</span><strong className={critical ? 'text-hive-danger' : ''}>{loading ? 'Checking' : critical ?? 'Unknown'}</strong>
            <small>In up to six recent stored events</small>
          </Link>
        </div>

        <section className="hive-evidence-card" aria-labelledby="exception-title">
          <div className="hive-section-heading"><h2 id="exception-title">Requires attention</h2><Link to="/ops">Operations →</Link></div>
          {!currentHealth ? <p className="hive-evidence-caption">Current service evidence unavailable or stale. No healthy state is inferred.</p>
            : attention?.length ? <ul className="hive-evidence-list">
              {attention.map((repo) => <li key={repo.repo}><Link to={`/repositories?repo=${encodeURIComponent(repo.repo)}`}>{repo.label ?? repo.repo}</Link>
                <StatusBadge status={repo.status} variant="operational" /></li>)}
            </ul> : <p className="hive-evidence-caption">No service exceptions in the current probe.</p>}
          {critical ? <p className="hive-evidence-caption text-rose-200">{critical} critical event(s) in recent stored alerts; check Operations for context.</p> : null}
        </section>
        <details className="hive-lamp-legend">
          <summary>Indicator key</summary>
          <div className="hive-legend-items">
            {([['healthy', 'Healthy'], ['warning', 'Attention'], ['failed', 'Failure'], ['checking', 'Checking / information'],
              ['maintenance', 'Maintenance / standby'], ['unknown', 'Unknown']] as const).map(([status, label]) =>
              <span key={status}><StatusBadge status={status} label={label} /><span aria-hidden="true">{label}</span></span>)}
          </div>
        </details>
        <div className="hive-evidence-grid">
          <section className="hive-evidence-card" aria-labelledby="service-title">
            <div className="hive-section-heading"><h2 id="service-title">Service health</h2><Link to="/repositories">View estate →</Link></div>
            <p className="hive-evidence-caption">{snapshot.repositories?.generated_at ? 'Probe generated ' + formatDate(snapshot.repositories.generated_at) : 'Probe timestamp not reported'}</p>
            {repos?.length ? <ul className="hive-evidence-list">
              {orderedRepos.map((repo) => <li key={repo.repo}><Link to={`/repositories?repo=${encodeURIComponent(repo.repo)}`}>{repo.label ?? repo.repo}</Link>
                <StatusBadge status={currentHealth ? repo.status : 'unknown'} variant="operational" /></li>)}
            </ul> : <p className="hive-evidence-caption">{loading ? 'Loading service evidence…' : repos ? 'No services reported.' : 'Service health unavailable.'}</p>}
          </section>
          <section className="hive-evidence-card" aria-labelledby="alert-title">
            <div className="hive-section-heading"><h2 id="alert-title">Recent alerts</h2><Link to="/ops">View alerts →</Link></div>
            <p className="hive-evidence-caption">Operational timeline · historical events, not proof of current incidents.</p>
            {alerts?.length ? <ul className="hive-alert-list">
              {orderedAlerts.map((item) => (
                <li key={item.event_id}>
                  <div>
                    <p>{item.title ?? item.event_type ?? 'Operational event'}</p>
                    <small><time dateTime={item.occurred_at ?? item.received_at ?? undefined}>
                      {item.occurred_at ? formatDate(item.occurred_at) : item.received_at ? 'Received ' + formatDate(item.received_at) : 'Time not reported'}
                    </time></small>
                    {item.summary && <small>{item.summary}</small>}
                  </div>
                  <StatusBadge status={item.severity ?? 'unknown'} dotOnly={['critical', 'warning', 'info'].includes(item.severity ?? '')} />
                </li>
              ))}
            </ul> : <p className="hive-evidence-caption">{loading ? 'Loading alert evidence…' : alerts ? 'No recent events returned.' : 'Alert evidence unavailable.'}</p>}
          </section>
        </div>

        <section aria-labelledby="workspace-title">
          <div className="hive-section-heading"><div><h2 id="workspace-title">Your workspaces</h2><p>Go directly to the tools you need.</p></div></div>
          <div className="hive-workspace-grid">
            {destinations.map(({ to, title, description, icon: Icon }) => (
              <Link to={to} key={to} className="hive-workspace-card">
                <Icon className="h-5 w-5" aria-hidden="true" />
                <div><h3>{title}</h3><p>{description}</p></div>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
