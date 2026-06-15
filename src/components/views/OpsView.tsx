import { useState, useEffect, useCallback } from 'react'
import { health as healthApi, workflows, executionReviews, system } from '@/api/hive'
import type { HealthResponse, WorkflowGraph, ExecutionReviewPlan } from '@/types'
import { planStatusColour, nodeStatusColour, formatDate, cx } from '@/utils'
import { Spinner, EmptyState, ErrorBanner, Flag, KVRow, Badge } from '@/components/shared'

type OpsTab = 'health' | 'workflow' | 'reviews' | 'hygiene'

export function OpsView() {
  const [tab, setTab] = useState<OpsTab>('health')

  const TABS: { id: OpsTab; icon: string; label: string }[] = [
    { id: 'health',   icon: '◉', label: 'Health'   },
    { id: 'workflow', icon: '⊞', label: 'Workflow'  },
    { id: 'reviews',  icon: '◱', label: 'Reviews'  },
    { id: 'hygiene',  icon: '⊛', label: 'Hygiene'  },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-hive-border shrink-0">
        <h1 className="text-sm font-semibold text-hive-text">Ops</h1>
        <div className="flex gap-1 bg-hive-surfaceHi rounded-hive p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                'text-xs px-3 py-1 rounded transition-colors flex items-center gap-1',
                tab === t.id
                  ? 'bg-hive-surface text-hive-text border border-hive-border'
                  : 'text-hive-textDim hover:text-hive-textSoft',
              )}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'health'   && <HealthPanel />}
        {tab === 'workflow' && <WorkflowPanel />}
        {tab === 'reviews'  && <ReviewsPanel />}
        {tab === 'hygiene'  && <HygienePanel />}
      </div>
    </div>
  )
}

// ── Health panel ───────────────────────────────────────────────────────────
function HealthPanel() {
  const [data, setData]     = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    healthApi.get()
      .then(setData)
      .catch(e => setError(String(e?.detail ?? e?.message ?? e)))
      .finally(() => setLoading(false))
  }, [])

  const handleRefresh = () => {
    setLoading(true)
    setError(null)
    healthApi.get()
      .then(setData)
      .catch(e => setError(String(e?.detail ?? e?.message ?? e)))
      .finally(() => setLoading(false))
  }

  return (
    <div className="overflow-y-auto h-full p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="hive-section-title">System Health</span>
        <button onClick={handleRefresh} className="hive-btn-ghost text-xs">↻ Refresh</button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 max-w-2xl">
          {/* Build info */}
          <div className="hive-card">
            <p className="hive-section-title mb-3">Build</p>
            <KVRow label="App" value={data.app ?? '—'} />
            <KVRow label="Build" value={data.build ?? '—'} mono />
            <KVRow label="Env" value={data.env ?? '—'} mono />
            <KVRow label="Status" value={
              <span className={data.ok ? 'text-hive-success font-medium' : 'text-hive-error font-medium'}>
                {data.ok ? '✓ healthy' : '✗ degraded'}
              </span>
            } />
          </div>

          {/* Storage flags */}
          <div className="hive-card">
            <p className="hive-section-title mb-3">Storage & AI</p>
            <Flag label="R2 Storage"         ok={data.storage?.r2_configured}    detail={data.storage?.r2_bucket} />
            <Flag label="OpenRouter"          ok={data.llm?.openrouter_configured} detail={data.llm?.default_model} />
            <Flag label="PostgreSQL"          ok={data.database?.configured}      detail={data.database?.dialect} />
            <Flag label="Cloudflare D1"       ok={data.d1?.configured}            detail={data.d1?.database_name} />
            <Flag label="Vectorize"           ok={data.vectorize?.enabled}        detail={data.vectorize?.index_name} />
            <Flag label="Workers AI Embeddings" ok={data.embeddings?.enabled}     detail={data.embeddings?.model} />
          </div>

          {/* LLM detail */}
          {data.llm && (
            <div className="hive-card">
              <p className="hive-section-title mb-3">LLM Config</p>
              <KVRow label="Default model"   value={data.llm.default_model ?? '—'} mono />
              <KVRow label="Free fallback"   value={data.llm.free_fallback_model ?? '—'} mono />
              <KVRow label="Paid fallback"   value={String(data.llm.allow_paid_fallback ?? false)} mono />
            </div>
          )}
        </div>
      ) : (
        <EmptyState icon="◉" title="No health data" />
      )}
    </div>
  )
}

// ── Workflow panel ─────────────────────────────────────────────────────────
function WorkflowPanel() {
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; description: string }>>([])
  const [selected, setSelected]   = useState('')
  const [task, setTask]           = useState('')
  const [graph, setGraph]         = useState<WorkflowGraph | null>(null)
  const [stepStatuses, setStepStatuses] = useState<Record<string, unknown>[]>([])
  const [blockedNodes, setBlockedNodes] = useState<string[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    workflows.templates()
      .then(res => setTemplates(res.templates ?? []))
      .catch(() => setTemplates([]))
  }, [])

  const handleBuild = useCallback(async () => {
    if (!task.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await workflows.executionPreview({
        task,
        template: selected || undefined,
      })
      setGraph(res.graph)
      setStepStatuses(res.step_statuses as Record<string, unknown>[] ?? [])
      setBlockedNodes(res.blocked_nodes ?? [])
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Failed to build workflow')
    } finally {
      setLoading(false)
    }
  }, [task, selected])

  return (
    <div className="overflow-y-auto h-full p-5">
      <div className="max-w-3xl space-y-4">
        <div className="hive-card space-y-3">
          <p className="hive-section-title">Execution Preview</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Describe the task…"
              value={task}
              onChange={e => setTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBuild()}
              className="hive-input flex-1 text-sm"
            />
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="hive-input w-44 text-sm"
            >
              <option value="">Auto template</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              onClick={handleBuild}
              disabled={!task.trim() || loading}
              className="hive-btn-primary px-4 disabled:opacity-50"
            >
              {loading ? <Spinner size="sm" /> : 'Preview'}
            </button>
          </div>
        </div>

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {graph && (
          <div className="space-y-4 animate-fade-in">
            {/* Graph nodes */}
            <div className="hive-card">
              <p className="hive-section-title mb-3">
                Workflow Nodes
                {blockedNodes.length > 0 && (
                  <span className="ml-2 text-hive-error">({blockedNodes.length} blocked)</span>
                )}
              </p>
              <div className="space-y-2">
                {graph.nodes.map((node, i) => {
                  const isBlocked = blockedNodes.includes(node.node_id)
                  const stepInfo = stepStatuses[i] as Record<string, unknown> | undefined
                  return (
                    <div
                      key={node.node_id}
                      className={cx(
                        'flex items-start gap-3 p-3 rounded-hive border transition-all',
                        nodeStatusColour(node.status, isBlocked),
                      )}
                    >
                      {/* Step number */}
                      <span className={cx(
                        'w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0',
                        isBlocked
                          ? 'bg-red-900/30 text-hive-error border border-hive-error/40'
                          : 'bg-hive-surfaceHi text-hive-textSoft border border-hive-border',
                      )}>
                        {i + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{node.label}</span>
                          <span className="text-2xs font-mono text-hive-textDim">{node.node_id}</span>
                          {isBlocked && <Badge variant="error">blocked</Badge>}
                          {node.status === 'complete' && <Badge variant="success">complete</Badge>}
                        </div>
                        {node.description && (
                          <p className="text-xs text-hive-textDim mt-0.5">{node.description}</p>
                        )}
                        {node.blocked_reason && (
                          <p className="text-xs text-hive-error mt-0.5">
                            ⚠ {node.blocked_reason}
                          </p>
                        )}
                        {stepInfo && typeof stepInfo === 'object' && (stepInfo as Record<string, unknown>).adapter_name && (
                          <p className="text-2xs text-hive-textDim mt-0.5 font-mono">
                            adapter: {String((stepInfo as Record<string, unknown>).adapter_name)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Edges */}
            {graph.edges.length > 0 && (
              <div className="hive-card">
                <p className="hive-section-title mb-2">Flow</p>
                <div className="flex flex-wrap gap-2">
                  {graph.edges.map((edge, i) => (
                    <span key={i} className="text-xs text-hive-textDim font-mono bg-hive-surfaceHi px-2 py-1 rounded">
                      {edge.from} → {edge.to}
                      {edge.label && <span className="text-hive-textDim"> ({edge.label})</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Reviews panel ──────────────────────────────────────────────────────────
function ReviewsPanel() {
  const [plans, setPlans]     = useState<ExecutionReviewPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [newTask, setNewTask] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<ExecutionReviewPlan | null>(null)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await executionReviews.list(50)
      setPlans(res.plans ?? [])
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Failed to load plans')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPlans() }, [loadPlans])

  const handleCreate = useCallback(async () => {
    if (!newTask.trim()) return
    setCreating(true)
    try {
      const res = await executionReviews.create({ task: newTask, dry_run: true })
      setNewTask('')
      await loadPlans()
      if (res.plan) setSelected(res.plan)
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Failed to create plan')
    } finally {
      setCreating(false)
    }
  }, [newTask, loadPlans])

  const handleDecide = useCallback(async (planId: string, decision: string) => {
    try {
      await executionReviews.decide(planId, decision)
      await loadPlans()
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Decision failed')
    }
  }, [loadPlans])

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className="w-80 border-r border-hive-border flex flex-col shrink-0">
        {/* New plan */}
        <div className="p-3 border-b border-hive-border shrink-0">
          <p className="hive-section-title mb-2">New Review Plan</p>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Task description…"
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="hive-input flex-1 text-xs"
            />
            <button
              onClick={handleCreate}
              disabled={!newTask.trim() || creating}
              className="hive-btn-primary px-2 py-1 disabled:opacity-50"
            >
              {creating ? <Spinner size="sm" /> : '+'}
            </button>
          </div>
        </div>

        {/* Plan list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : plans.length === 0 ? (
            <EmptyState icon="◱" title="No review plans" />
          ) : plans.map(plan => (
            <button
              key={plan.plan_id}
              onClick={() => setSelected(plan)}
              className={cx(
                'w-full flex flex-col gap-0.5 px-3 py-2.5 text-left border-b border-hive-border/30 transition-colors hover:bg-hive-surfaceHi',
                selected?.plan_id === plan.plan_id && 'bg-hive-accentSoft border-l-2 border-l-hive-accent',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cx('text-xs font-medium truncate flex-1', planStatusColour(plan.status))}>
                  {plan.task.length > 35 ? plan.task.slice(0, 35) + '…' : plan.task}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cx('text-2xs font-medium capitalize', planStatusColour(plan.status))}>
                  {plan.status.replace('_', ' ')}
                </span>
                <span className="text-2xs text-hive-textDim">·</span>
                <span className="text-2xs text-hive-textDim">{formatDate(plan.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto p-5">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {!selected ? (
          <EmptyState icon="◱" title="Select a plan" description="Choose a review plan from the list to see details" />
        ) : (
          <div className="max-w-2xl space-y-4 animate-fade-in">
            <div className="hive-card">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-hive-text leading-snug">{selected.task}</h2>
                <span className={cx('hive-badge border border-hive-border capitalize shrink-0', planStatusColour(selected.status))}>
                  {selected.status.replace('_', ' ')}
                </span>
              </div>
              <KVRow label="Plan ID"  value={selected.plan_id} mono />
              <KVRow label="Created"  value={formatDate(selected.created_at)} />
              <KVRow label="Policy"   value={selected.policy_profile ?? 'strict'} mono />
              <KVRow label="Dry run"  value={String(selected.dry_run)} mono />
              <KVRow label="Can exec" value={String(selected.can_execute_now)} mono />
            </div>

            {/* Decision buttons */}
            {['pending_review', 'needs_changes'].includes(selected.status) && (
              <div className="hive-card">
                <p className="hive-section-title mb-3">Decision</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { decision: 'approved',      label: '✓ Approve',        cls: 'bg-green-900/30 border-green-700/40 text-hive-success hover:bg-green-900/50' },
                    { decision: 'needs_changes', label: '⚠ Needs Changes',  cls: 'bg-yellow-900/30 border-yellow-700/40 text-hive-warning hover:bg-yellow-900/50' },
                    { decision: 'rejected',      label: '✗ Reject',         cls: 'bg-red-900/30 border-red-700/40 text-hive-error hover:bg-red-900/50' },
                    { decision: 'archived',      label: '◫ Archive',        cls: 'bg-hive-surfaceHi border-hive-border text-hive-textDim hover:bg-hive-surfaceHi' },
                  ].map(({ decision, label, cls }) => (
                    <button
                      key={decision}
                      onClick={() => handleDecide(selected.plan_id, decision)}
                      className={cx('hive-btn border text-xs', cls)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hygiene panel ──────────────────────────────────────────────────────────
function HygienePanel() {
  const [report, setReport]   = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const runReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await system.repoHygiene(true)
      setReport(res as unknown as Record<string, unknown>)
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Hygiene report failed')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="overflow-y-auto h-full p-5">
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="hive-section-title">Repo Hygiene Report</span>
          <button
            onClick={runReport}
            disabled={loading}
            className="hive-btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
          >
            {loading ? <Spinner size="sm" /> : '⊛ Run Report (dry run)'}
          </button>
        </div>

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {!report && !loading && (
          <EmptyState
            icon="⊛"
            title="No report yet"
            description="Run a dry-run hygiene report to inspect repo health"
          />
        )}

        {report && (
          <div className="space-y-3 animate-fade-in">
            {/* Summary */}
            {report.summary && typeof report.summary === 'object' && (
              <div className="hive-card">
                <p className="hive-section-title mb-3">Summary</p>
                {Object.entries(report.summary as Record<string, unknown>).map(([k, v]) => (
                  <KVRow key={k} label={k.replace(/_/g, ' ')} value={String(v)} mono />
                ))}
              </div>
            )}

            {/* Duplicates */}
            {Array.isArray(report.duplicates) && report.duplicates.length > 0 && (
              <div className="hive-card">
                <p className="hive-section-title mb-2">
                  Duplicates <Badge variant="warning">{report.duplicates.length}</Badge>
                </p>
                {(report.duplicates as Array<{ type: string; items: string[] }>).map((d, i) => (
                  <div key={i} className="mb-2">
                    <p className="text-xs font-medium text-hive-warning capitalize mb-1">{d.type}</p>
                    <div className="space-y-0.5">
                      {d.items.map((item, j) => (
                        <p key={j} className="text-xs text-hive-textDim font-mono truncate">{item}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Orphans */}
            {Array.isArray(report.orphans) && report.orphans.length > 0 && (
              <div className="hive-card">
                <p className="hive-section-title mb-2">
                  Orphans <Badge variant="warning">{report.orphans.length}</Badge>
                </p>
                <div className="space-y-0.5">
                  {(report.orphans as string[]).map((o, i) => (
                    <p key={i} className="text-xs text-hive-textDim font-mono truncate">{o}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Deletion manifest */}
            {Array.isArray(report.deletion_manifest) && report.deletion_manifest.length > 0 && (
              <div className="hive-card">
                <p className="hive-section-title mb-2">
                  Deletion Manifest (dry run) <Badge variant="dim">{report.deletion_manifest.length}</Badge>
                </p>
                <div className="space-y-1.5">
                  {(report.deletion_manifest as Array<{ path: string; reason: string }>).map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-hive-error text-xs shrink-0">✕</span>
                      <div>
                        <p className="text-xs font-mono text-hive-text truncate">{item.path}</p>
                        <p className="text-2xs text-hive-textDim">{item.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON fallback for other fields */}
            {report.build_stage_hint && (
              <p className="text-2xs text-hive-textDim font-mono">
                {String(report.build_stage_hint)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
