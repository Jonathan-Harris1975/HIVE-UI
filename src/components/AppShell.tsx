import {
  Activity,
  BrainCircuit,
  Check,
  Copy,
  Database,
  Files,
  LogOut,
  Menu,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Trash2,
  Pencil,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useInspector, type InspectorRow } from '../context/InspectorContext'
import { HIVE_UI_BUILD, HIVE_UI_VERSION } from '../lib/build'
import { formatCost, formatDate } from '../lib/format'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { ConfirmDialog } from './ConfirmDialog'
import { EmptyState } from './EmptyState'
import { HiveLogo } from './HiveLogo'

// Header overflow strategy: keep only two mobile-visible actions in HeaderActions. A future third action should move into a HeaderActionsSheet bottom sheet triggered by MoreHorizontal.
const navigation = [
  { to: '/chat', label: 'Chat', icon: MessageSquareText },
  { to: '/files', label: 'Files', icon: Files },
  { to: '/skills', label: 'Skills', icon: BrainCircuit },
  { to: '/memory', label: 'Memory', icon: Database },
  { to: '/ops', label: 'Ops', icon: Activity },
]

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/chat': { title: 'Chat', subtitle: 'Private model routing and persistent conversations' },
  '/files': { title: 'Files', subtitle: 'Browse authenticated R2 lanes and bring evidence into chat' },
  '/skills': { title: 'Skills', subtitle: 'Search the shared HIVE skill registry' },
  '/memory': { title: 'Memory', subtitle: 'Persistent repository knowledge that survives cleanup' },
  '/ops': { title: 'Operations', subtitle: 'Health, workflow previews and review gates' },
}

interface PendingConversationDialog {
  type: 'rename' | 'delete'
  id: string
  title: string
}

function ConversationSection({ closeMobile }: { closeMobile?: () => void }) {
  const navigate = useNavigate()
  const {
    conversations,
    conversationsLoading,
    currentConversationId,
    openConversation,
    newConversation,
    renameConversation,
    deleteConversation,
  } = useChat()
  const [query, setQuery] = useState('')
  const [pendingDialog, setPendingDialog] = useState<PendingConversationDialog | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dialogBusy, setDialogBusy] = useState(false)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return conversations
    return conversations.filter((conversation) =>
      (conversation.title || conversation.id).toLowerCase().includes(needle),
    )
  }, [conversations, query])

  function createConversation() {
    newConversation()
    navigate('/chat')
    closeMobile?.()
  }

  async function selectConversation(id: string) {
    await openConversation(id)
    navigate('/chat')
    closeMobile?.()
  }

  function openRename(id: string, existingTitle: string) {
    setRenameValue(existingTitle)
    setPendingDialog({ type: 'rename', id, title: existingTitle })
  }

  function openDelete(id: string, title: string) {
    setPendingDialog({ type: 'delete', id, title })
  }

  async function confirmDialog() {
    if (!pendingDialog) return
    setDialogBusy(true)
    try {
      if (pendingDialog.type === 'rename') {
        const cleanTitle = renameValue.trim()
        if (cleanTitle) await renameConversation(pendingDialog.id, cleanTitle)
      } else {
        await deleteConversation(pendingDialog.id)
      }
      setPendingDialog(null)
    } finally {
      setDialogBusy(false)
    }
  }

  const noResultsTitle = query.trim() ? 'No conversations match that search.' : 'No persisted conversations yet.'
  const noResultsAction = query.trim()
    ? { label: 'Clear search', onClick: () => setQuery('') }
    : { label: 'New conversation', onClick: createConversation }

  return (
    <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-white/8 pt-5">
      <button
        type="button"
        onClick={createConversation}
        className="flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/8 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/12"
      >
        <Plus className="h-4 w-4" /> New conversation
      </button>
      <label className="relative mt-3 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search conversations"
          className="h-9 w-full rounded-lg border border-white/8 bg-[#071426] pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-400 focus:border-cyan-300/30"
        />
      </label>

      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {conversationsLoading && !conversations.length && (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-white/5" />)}
          </div>
        )}
        {!conversationsLoading && !filtered.length && (
          <EmptyState title={noResultsTitle} body={query.trim() ? 'The sidebar filter is hiding every stored conversation.' : 'Start a clean HIVE thread and it will appear here once persisted.'} action={noResultsAction} />
        )}
        {filtered.map((conversation) => {
          const title = conversation.title || 'Untitled conversation'
          const active = conversation.id === currentConversationId
          return (
            <div
              key={conversation.id}
              className={`group relative rounded-xl border transition ${active ? 'border-cyan-300/20 bg-cyan-300/8' : 'border-transparent hover:border-white/8 hover:bg-white/[0.035]'}`}
            >
              <button
                type="button"
                onClick={() => void selectConversation(conversation.id)}
                className="w-full px-3 py-2.5 pr-16 text-left"
              >
                <div className={`truncate text-xs font-medium ${active ? 'text-cyan-100' : 'text-slate-300'}`}>{title}</div>
                <div className="mt-1 flex gap-2 text-[11px] text-slate-400">
                  <span>{conversation.message_count ?? 0} messages</span>
                  <span>·</span>
                  <span>{formatDate(conversation.updated_at)}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {(conversation.total_tokens ?? conversation.token_total) != null ? Number(conversation.total_tokens ?? conversation.token_total).toLocaleString() : '—'} tokens · {conversation.total_cost_usd != null || conversation.cost_usd != null ? formatCost(conversation.total_cost_usd ?? conversation.cost_usd) : '—'}
                </div>
              </button>
              {/* Visible by default on touch/small screens (no hover state exists there); fades in on hover/focus for pointer devices at lg+. */}
              <div className="absolute right-2 top-2 flex opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                <button
                  type="button"
                  aria-label="Rename conversation"
                  onClick={() => openRename(conversation.id, title)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-white/8 hover:text-cyan-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete conversation"
                  onClick={() => openDelete(conversation.id, title)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-400/10 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDialog)}
        title={pendingDialog?.type === 'rename' ? 'Rename conversation' : 'Delete conversation'}
        summary={pendingDialog?.type === 'rename'
          ? 'This updates the stored conversation title used in the sidebar and conversation record.'
          : 'This permanently removes the persisted conversation and its related message and cost records.'}
        objectName={pendingDialog?.title}
        systems={pendingDialog?.type === 'rename' ? ['PostgreSQL conversation row'] : ['PostgreSQL conversation row', 'PostgreSQL message rows', 'PostgreSQL cost records']}
        confirmLabel={pendingDialog?.type === 'rename' ? 'Rename' : 'Delete conversation'}
        tone={pendingDialog?.type === 'delete' ? 'destructive' : 'default'}
        busy={dialogBusy}
        confirmDisabled={pendingDialog?.type === 'rename' ? !renameValue.trim() : false}
        textInput={pendingDialog?.type === 'rename' ? { label: 'Conversation title', value: renameValue, onChange: setRenameValue, required: true } : undefined}
        onConfirm={() => void confirmDialog()}
        onCancel={() => setPendingDialog(null)}
      />
    </div>
  )
}

function SidebarContent({ closeMobile }: { closeMobile?: () => void }) {
  const { logout } = useAuth()
  const { pathname } = useLocation()

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between px-1">
        <HiveLogo size="sm" />
        {closeMobile && (
          <button type="button" onClick={closeMobile} aria-label="Close navigation" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="mt-6 grid grid-cols-4 gap-1 lg:grid-cols-1">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={closeMobile}
            aria-label={label}
            title={label}
            className={({ isActive }) => `flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm transition lg:justify-start ${isActive ? 'bg-white/8 text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'}`}
          >
            <Icon className="h-4.5 w-4.5" />
            <span className="hidden lg:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      {pathname === '/chat' ? <ConversationSection closeMobile={closeMobile} /> : <div className="flex-1" />}

      <div className="mt-4 border-t border-white/8 pt-4">
        <p className="mb-2 px-3 text-[10px] uppercase tracking-[0.14em] text-slate-400" title={HIVE_UI_BUILD}>UI {HIVE_UI_VERSION}</p>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  )
}

function InspectorRowView({ row }: { row: InspectorRow }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const long = row.value.length > 120
  const value = long && !expanded ? `${row.value.slice(0, 120)}…` : row.value

  async function copyRow() {
    await navigator.clipboard.writeText(row.value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="rounded-xl border border-white/8 bg-[#071426] p-3">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{row.label}</dt>
        <button type="button" onClick={() => void copyRow()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 hover:text-cyan-200" aria-label={`Copy ${row.label}`}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <dd className="mt-1 break-words text-xs leading-5 text-slate-300">{value}</dd>
      {long && (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="mt-2 text-[11px] font-medium text-cyan-200 hover:text-cyan-100">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function InspectorPanel() {
  const { open, payload, setOpen } = useInspector()

  return (
    <aside className={`fixed inset-y-0 right-0 z-40 w-[min(360px,92vw)] border-l border-white/8 bg-[#0a192d]/98 shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform lg:static lg:z-auto lg:shadow-none ${open ? 'translate-x-0' : 'translate-x-full lg:hidden'}`}>
      <div className="flex h-full flex-col">
        <div className="flex h-[73px] items-center justify-between border-b border-white/8 px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">{payload.eyebrow ?? 'Inspector'}</p>
            <h2 className="mt-1 truncate text-sm font-semibold text-white">{payload.title}</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close inspector" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
            <PanelRightClose className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {payload.description && <p className="text-sm leading-6 text-slate-400">{payload.description}</p>}
          {payload.loading ? (
            <div className="mt-5 space-y-3" aria-live="polite" aria-label="Inspector loading">
              {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl border border-white/8 bg-white/[0.035]" />)}
            </div>
          ) : payload.rows && payload.rows.length > 0 ? (
            <dl className="mt-5 space-y-3">
              {payload.rows.map((row) => <InspectorRowView key={`${row.label}-${row.value}`} row={row} />)}
            </dl>
          ) : null}
          {payload.json !== undefined && !payload.loading && (
            <pre className="mt-5 overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-[#040b18] p-4 text-[11px] leading-5 text-slate-400">
              {JSON.stringify(payload.json, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </aside>
  )
}

function HeaderActions({ health, open, toggle }: { health: ReturnType<typeof useAuth>['health']; open: boolean; toggle: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-[11px] text-slate-400 sm:flex">
        <span className={`h-2 w-2 rounded-full ${health?.ok ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.7)]' : 'bg-amber-300'}`} />
        {health?.build ?? 'HIVE'}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={open}
        aria-label={open ? 'Close inspector' : 'Open inspector'}
        className={`rounded-xl border p-2.5 transition ${open ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200' : 'border-white/8 bg-white/[0.035] text-slate-400 hover:text-white'}`}
        title="Toggle inspector"
      >
        {open ? <PanelRightClose className="h-4.5 w-4.5" /> : <PanelRightOpen className="h-4.5 w-4.5" />}
      </button>
    </div>
  )
}

function useMobileDrawer(open: boolean, close: () => void) {
  const drawerRef = useRef<HTMLElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    const raf = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus()
    })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || !drawerRef.current) return
      const items = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      previousFocusRef.current?.focus()
    }
  }, [open, close])

  return drawerRef
}

export function AppShell() {
  const { pathname } = useLocation()
  const { health } = useAuth()
  const online = useOnlineStatus()
  const { open, toggle } = useInspector()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const closeMobileMenu = () => setMobileMenuOpen(false)
  const mobileDrawerRef = useMobileDrawer(mobileMenuOpen, closeMobileMenu)
  const meta = pageMeta[pathname] ?? { title: 'HIVE', subtitle: 'Private operations console' }

  useEffect(() => {
    document.title = `${meta.title} · HIVE`
  }, [meta.title])

  return (
    <div className="flex h-screen overflow-hidden bg-[#061126] text-slate-100">
      <a href="#hive-main-content" className="sr-only z-[100] rounded-lg bg-cyan-300 px-3 py-2 font-semibold text-[#052035] focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to main content</a>
      <aside className="hidden w-[280px] shrink-0 border-r border-white/8 bg-[#0a192d] lg:block">
        <SidebarContent />
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={closeMobileMenu} />
          <aside
            ref={mobileDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-[min(320px,90vw)] border-r border-white/10 bg-[#0a192d] shadow-2xl"
          >
            <SidebarContent closeMobile={closeMobileMenu} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {!online && (
          <div role="status" className="shrink-0 border-b border-amber-300/20 bg-amber-300/8 px-4 py-2 text-center text-xs text-amber-100">
            Browser offline. Stored pages remain visible, but HIVE requests will wait for the connection to return.
          </div>
        )}
        <header className="flex h-[73px] shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-[#071426]/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-white">{meta.title}</h1>
              <p className="hidden truncate text-xs text-slate-400 sm:block">{meta.subtitle}</p>
            </div>
          </div>
          <HeaderActions health={health} open={open} toggle={toggle} />
        </header>

        <main id="hive-main-content" className="min-h-0 flex-1 overflow-hidden" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <InspectorPanel />
    </div>
  )
}
