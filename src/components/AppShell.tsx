import {
  Activity,
  BrainCircuit,
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
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useInspector } from '../context/InspectorContext'
import { HIVE_UI_BUILD, HIVE_UI_VERSION } from '../lib/build'
import { formatDate } from '../lib/format'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { HiveLogo } from './HiveLogo'

const navigation = [
  { to: '/chat', label: 'Chat', icon: MessageSquareText },
  { to: '/files', label: 'Files', icon: Files },
  { to: '/skills', label: 'Skills', icon: BrainCircuit },
  { to: '/ops', label: 'Ops', icon: Activity },
]

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/chat': { title: 'Chat', subtitle: 'Private model routing and persistent conversations' },
  '/files': { title: 'Files', subtitle: 'Browse authenticated R2 lanes and bring evidence into chat' },
  '/skills': { title: 'Skills', subtitle: 'Search the shared HIVE skill registry' },
  '/ops': { title: 'Operations', subtitle: 'Health, workflow previews and review gates' },
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

  async function rename(id: string, existingTitle: string) {
    const title = window.prompt('Rename conversation', existingTitle)
    if (title?.trim()) await renameConversation(id, title.trim())
  }

  async function remove(id: string, title: string) {
    if (window.confirm(`Delete “${title}”? This removes its persisted messages and cost records.`)) {
      await deleteConversation(id)
    }
  }

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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search conversations"
          className="h-9 w-full rounded-lg border border-white/8 bg-[#071426] pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/30"
        />
      </label>

      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {conversationsLoading && !conversations.length && (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-white/5" />)}
          </div>
        )}
        {!conversationsLoading && !filtered.length && (
          <p className="px-2 py-5 text-center text-xs leading-5 text-slate-600">No persisted conversations yet.</p>
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
                <div className="mt-1 flex gap-2 text-[10px] text-slate-600">
                  <span>{conversation.message_count ?? 0} messages</span>
                  <span>·</span>
                  <span>{formatDate(conversation.updated_at)}</span>
                </div>
              </button>
              <div className="absolute right-2 top-2 flex opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  aria-label="Rename conversation"
                  onClick={() => void rename(conversation.id, title)}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-white/8 hover:text-cyan-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete conversation"
                  onClick={() => void remove(conversation.id, title)}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-rose-400/10 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
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
          <button type="button" onClick={closeMobile} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
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
            className={({ isActive }) => `flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm transition lg:justify-start ${isActive ? 'bg-white/8 text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'}`}
          >
            <Icon className="h-4.5 w-4.5" />
            <span className="hidden lg:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      {pathname === '/chat' ? <ConversationSection closeMobile={closeMobile} /> : <div className="flex-1" />}

      <div className="mt-4 border-t border-white/8 pt-4">
        <p className="mb-2 px-3 text-[10px] uppercase tracking-[0.14em] text-slate-700" title={HIVE_UI_BUILD}>UI {HIVE_UI_VERSION}</p>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-200"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  )
}

function InspectorPanel() {
  const { open, payload, setOpen } = useInspector()

  return (
    <aside className={`fixed inset-y-0 right-0 z-40 w-[min(360px,92vw)] border-l border-white/8 bg-[#0a192d]/98 shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform lg:static lg:z-auto lg:shadow-none ${open ? 'translate-x-0' : 'translate-x-full lg:hidden'}`}>
      <div className="flex h-full flex-col">
        <div className="flex h-[73px] items-center justify-between border-b border-white/8 px-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">{payload.eyebrow ?? 'Inspector'}</p>
            <h2 className="mt-1 text-sm font-semibold text-white">{payload.title}</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white">
            <PanelRightClose className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {payload.description && <p className="text-sm leading-6 text-slate-400">{payload.description}</p>}
          {payload.rows && payload.rows.length > 0 && (
            <dl className="mt-5 space-y-3">
              {payload.rows.map((row) => (
                <div key={`${row.label}-${row.value}`} className="rounded-xl border border-white/8 bg-[#071426] p-3">
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-slate-600">{row.label}</dt>
                  <dd className="mt-1 break-words text-xs leading-5 text-slate-300">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {payload.json !== undefined && (
            <pre className="mt-5 overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-[#040b18] p-4 text-[11px] leading-5 text-slate-400">
              {JSON.stringify(payload.json, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </aside>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const { health } = useAuth()
  const online = useOnlineStatus()
  const { open, toggle } = useInspector()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(320px,90vw)] border-r border-white/10 bg-[#0a192d] shadow-2xl">
            <SidebarContent closeMobile={() => setMobileMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {!online && (
          <div role="status" className="shrink-0 border-b border-amber-300/20 bg-amber-300/8 px-4 py-2 text-center text-xs text-amber-100">
            Browser offline. Stored pages remain visible, but HIVE requests will wait for the connection to return.
          </div>
        )}
        <header className="flex h-[73px] shrink-0 items-center justify-between border-b border-white/8 bg-[#071426]/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-white">{meta.title}</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{meta.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-[11px] text-slate-400 sm:flex">
              <span className={`h-2 w-2 rounded-full ${health?.ok ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.7)]' : 'bg-amber-300'}`} />
              {health?.build ?? 'HIVE'}
            </div>
            <button
              type="button"
              onClick={toggle}
              aria-pressed={open}
              className={`rounded-xl border p-2.5 transition ${open ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200' : 'border-white/8 bg-white/[0.035] text-slate-400 hover:text-white'}`}
              title="Toggle inspector"
            >
              {open ? <PanelRightClose className="h-4.5 w-4.5" /> : <PanelRightOpen className="h-4.5 w-4.5" />}
            </button>
          </div>
        </header>

        <main id="hive-main-content" className="min-h-0 flex-1 overflow-hidden" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <InspectorPanel />
    </div>
  )
}
