import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  body?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.018] px-5 py-10 text-center">
      {icon && <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.035] text-slate-400">{icon}</div>}
      <h3 className="mt-4 text-sm font-semibold text-slate-100">{title}</h3>
      {body && <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-400">{body}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 inline-flex h-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-4 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/12"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
