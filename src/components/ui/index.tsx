import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { NavLink } from 'react-router'

interface HeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: HeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-hive-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

interface SectionProps {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function Section({ title, description, action, children, className = '' }: SectionProps) {
  return (
    <section className={`space-y-4 ${className}`}>
      {(title || description || action) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-100">{title}</h3>}
            {description && <p className="mt-1 text-sm leading-6 text-hive-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Card({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-hive-lg bg-hive-surface p-4 shadow-hive sm:p-5 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-hive-muted">{label}</p>
      <div className="mt-1 text-xl font-semibold tracking-tight text-white">{value}</div>
      {hint && <div className="mt-1 text-sm text-slate-400">{hint}</div>}
    </div>
  )
}

export function KeyValueList({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-white/[0.06]">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4"
        >
          <dt className="text-sm text-hive-muted">{row.label}</dt>
          <dd className="min-w-0 break-words text-sm text-slate-100">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Tabs({ items }: { items: Array<{ to: string; label: string }> }) {
  return (
    <nav aria-label="Section navigation" className="flex gap-1 overflow-x-auto border-b border-white/[0.06]">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => [
            'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
            isActive ? 'border-hive-accent text-white' : 'border-transparent text-hive-muted hover:text-white',
          ].join(' ')}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }

export function Button({ variant = 'secondary', className = '', children, ...props }: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-hive-accent text-slate-950 hover:bg-hive-accent-strong',
    secondary: 'bg-white/[0.07] text-slate-100 hover:bg-white/[0.11]',
    ghost: 'bg-transparent text-hive-muted hover:bg-white/[0.05] hover:text-white',
    danger: 'bg-rose-500/14 text-rose-200 ring-1 ring-inset ring-rose-400/20 hover:bg-rose-500/20',
  }
  return (
    <button
      className={[
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-hive px-3.5 text-sm font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}

export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 rounded-hive-lg bg-hive-raised p-2 ${className}`}>{children}</div>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-hive bg-white/[0.06] ${className}`} />
}
