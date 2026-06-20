import { ArrowDown, CheckCircle2, CircleDot, LockKeyhole, ShieldAlert } from 'lucide-react'
import type { WorkflowEdge, WorkflowNode } from '../types/api'
import { StatusBadge } from './StatusBadge'

interface WorkflowGraphProps {
  nodes: WorkflowNode[]
  edges?: WorkflowEdge[]
  onInspect?: (node: WorkflowNode) => void
}

function NodeIcon({ status }: { status?: string }) {
  const value = (status || '').toLowerCase()
  if (value === 'complete' || value === 'approved' || value === 'ready_for_execution') return <CheckCircle2 className="h-4 w-4 text-emerald-300" />
  if (value === 'blocked') return <LockKeyhole className="h-4 w-4 text-rose-300" />
  if (value.includes('review')) return <ShieldAlert className="h-4 w-4 text-amber-300" />
  return <CircleDot className="h-4 w-4 text-cyan-300" />
}

export function WorkflowGraph({ nodes, edges = [], onInspect }: WorkflowGraphProps) {
  if (!nodes.length) {
    return <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-slate-600">Build a workflow to render its graph.</div>
  }

  const edgeLookup = new Map(edges.map((edge) => [`${edge.from}:${edge.to}`, edge]))

  return (
    <div className="space-y-0">
      {nodes.map((node, index) => {
        const next = nodes[index + 1]
        const linked = next ? edgeLookup.has(`${node.id}:${next.id}`) || edges.length === 0 : false
        return (
          <div key={node.id}>
            <button
              type="button"
              onClick={() => onInspect?.(node)}
              className="group grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border border-white/8 bg-[#071426] p-4 text-left transition hover:border-cyan-300/20 hover:bg-[#0a192d]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035]">
                <NodeIcon status={node.status} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">{node.label || node.id}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{node.summary || node.type || 'Workflow step'}</span>
                {node.skill_ids && node.skill_ids.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {node.skill_ids.map((skillId) => <span key={skillId} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-500">{skillId}</span>)}
                  </span>
                )}
              </span>
              <StatusBadge status={node.status} compact />
            </button>
            {next && linked && (
              <div className="flex h-9 items-center pl-[31px] text-slate-700">
                <ArrowDown className="h-4 w-4" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
