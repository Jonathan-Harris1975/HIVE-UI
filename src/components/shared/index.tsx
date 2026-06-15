import { cx } from '@/utils'

// ── Spinner ────────────────────────────────────────────────────────────────
interface SpinnerProps { size?: 'sm' | 'md' | 'lg'; className?: string }
export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-6 h-6' : 'w-4 h-4'
  return (
    <svg
      className={cx('animate-spin text-hive-accent', sz, className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode
  variant?: 'accent' | 'success' | 'warning' | 'error' | 'dim'
  className?: string
}
export function Badge({ children, variant = 'dim', className }: BadgeProps) {
  const colours = {
    accent:  'text-hive-accent  bg-hive-accentSoft  border-hive-accent/30',
    success: 'text-hive-success bg-green-900/20    border-green-700/30',
    warning: 'text-hive-warning bg-yellow-900/20   border-yellow-700/30',
    error:   'text-hive-error   bg-red-900/20      border-red-700/30',
    dim:     'text-hive-textDim bg-hive-surfaceHi  border-hive-border',
  }
  return (
    <span className={cx('hive-badge border', colours[variant], className)}>
      {children}
    </span>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}
export function EmptyState({ icon = '○', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <span className="text-3xl text-hive-textDim select-none">{icon}</span>
      <p className="text-sm font-medium text-hive-textSoft">{title}</p>
      {description && <p className="text-xs text-hive-textDim max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ── ErrorBanner ───────────────────────────────────────────────────────────
interface ErrorBannerProps { message: string; onDismiss?: () => void }
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-hive bg-red-900/20 border border-red-700/30 text-hive-error text-sm animate-fade-in">
      <span className="mt-0.5 shrink-0">⚠</span>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 hover:text-white transition-colors">×</button>
      )}
    </div>
  )
}

// ── InfoBanner ────────────────────────────────────────────────────────────
interface InfoBannerProps { message: string; variant?: 'info' | 'success' | 'warning' }
export function InfoBanner({ message, variant = 'info' }: InfoBannerProps) {
  const colours = {
    info:    'bg-hive-accentSoft border-hive-accent/30 text-hive-blue',
    success: 'bg-green-900/20 border-green-700/30 text-hive-success',
    warning: 'bg-yellow-900/20 border-yellow-700/30 text-hive-warning',
  }
  return (
    <div className={cx('flex items-center gap-2 p-3 rounded-hive border text-sm', colours[variant])}>
      <span className="shrink-0">{variant === 'success' ? '✓' : variant === 'warning' ? '⚠' : 'ℹ'}</span>
      <span>{message}</span>
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────
export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="border-hive-border my-3" />
  return (
    <div className="flex items-center gap-3 my-3">
      <hr className="flex-1 border-hive-border" />
      <span className="text-2xs text-hive-textDim uppercase tracking-widest">{label}</span>
      <hr className="flex-1 border-hive-border" />
    </div>
  )
}

// ── CopyButton ────────────────────────────────────────────────────────────
interface CopyButtonProps { text: string; className?: string }
export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy"
      className={cx(
        'text-2xs text-hive-textDim hover:text-hive-text transition-colors px-1.5 py-0.5 rounded',
        copied && 'text-hive-success',
        className,
      )}
    >
      {copied ? '✓ copied' : 'copy'}
    </button>
  )
}

// ── KeyValue row ──────────────────────────────────────────────────────────
interface KVRowProps { label: string; value: React.ReactNode; mono?: boolean }
export function KVRow({ label, value, mono }: KVRowProps) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-hive-border/40 last:border-0">
      <span className="text-2xs text-hive-textDim uppercase tracking-wider w-28 shrink-0 pt-0.5">
        {label}
      </span>
      <span className={cx('text-sm text-hive-text break-all', mono && 'font-mono text-xs text-hive-blue')}>
        {value}
      </span>
    </div>
  )
}

// ── Flag indicator (health flags) ─────────────────────────────────────────
interface FlagProps { label: string; ok: boolean | undefined; detail?: string }
export function Flag({ label, ok, detail }: FlagProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-hive-border/30 last:border-0">
      <span className="text-sm text-hive-textSoft">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-2xs text-hive-textDim font-mono">{detail}</span>}
        <span className={cx(
          'text-xs font-medium',
          ok === true  && 'text-hive-success',
          ok === false && 'text-hive-error',
          ok === undefined && 'text-hive-textDim',
        )}>
          {ok === true ? '✓ ok' : ok === false ? '✗ off' : '—'}
        </span>
      </div>
    </div>
  )
}

// Need React for CopyButton
import React from 'react'
